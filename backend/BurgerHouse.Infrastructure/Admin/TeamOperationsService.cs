using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed class TeamOperationsService(BurgerHouseDbContext db) : ITeamOperationsService
{
    private static readonly TimeZoneInfo OperationalZone = DateRange.Zone;

    public async Task<TeamMonth> MonthAsync(int id, DateOnly month, DateTime now, CancellationToken ct)
    {
        if (month.Day != 1 || month.Year is < 2000 or > 2100) throw new ArgumentException("Informe o primeiro dia do mês.");
        await RequireMember(id, false, ct);
        var next = month.AddMonths(1);
        var schedules = await db.Set<TeamWorkDay>().AsNoTracking().Where(x => x.TeamMemberId == id && x.Date >= month && x.Date < next).ToListAsync(ct);
        var entries = await db.Set<TeamJournalEntry>().AsNoTracking().Where(x => x.TeamMemberId == id && x.Date >= month && x.Date < next)
            .OrderByDescending(x => x.RecordedAtUtc).ThenBy(x => x.Id).ToListAsync(ct);
        var policy = await db.Set<TeamJournalEntry>().AsNoTracking().Where(x => x.TeamMemberId == id && x.Kind == "PayPolicy" && x.Date <= month)
            .OrderByDescending(x => x.Date).ThenByDescending(x => x.RecordedAtUtc).ThenByDescending(x => x.Id).FirstOrDefaultAsync(ct);
        var punches = ActivePunches(entries).ToLookup(x => x.Date);
        var planned = schedules.ToDictionary(x => x.Date);
        var days = planned.Keys.Concat(punches.Select(x => x.Key)).Distinct().Order()
            .Select(date => Summarize(date, planned.GetValueOrDefault(date), punches[date].ToList(), now)).ToList();
        var extra = days.Sum(x => x.ExtraMinutes ?? 0);
        var canEstimate = days.All(x => x.State != "Open" && (x.State != "Worked" || x.PlannedMinutes.HasValue));
        return new(days, entries.Select(Row).ToList(), days.Sum(x => x.WorkedMinutes ?? 0), extra,
            days.Count(x => x.State == "Absent"), days.Count(x => x.LateMinutes > 0), days.Count(x => x.State == "Worked"),
            canEstimate && policy?.OvertimeHourlyRate is decimal rate ? decimal.Round(extra * rate / 60, 2, MidpointRounding.AwayFromZero) : null,
            policy is null ? null : Row(policy));
    }

    public async Task<TeamDaySummary> ScheduleAsync(int id, DateOnly date, TeamWorkDayWrite request, int ownerId, DateTime now, CancellationToken ct)
    {
        await RequireMember(id, false, ct);
        if (date.Year is < 2000 or > 2100 || request.Start == request.End) throw new ArgumentException("Informe horários distintos para o turno.");
        var start = ToUtc(date.ToDateTime(request.Start));
        var end = ToUtc((request.End < request.Start ? date.AddDays(1) : date).ToDateTime(request.End));
        if (request.BreakMinutes < 0 || request.BreakMinutes >= (end - start).TotalMinutes)
            throw new ArgumentException("O intervalo previsto precisa caber no turno.");
        var schedule = await db.Set<TeamWorkDay>().FindAsync([id, date], ct);
        if ((schedule?.Revision ?? 0) != request.Revision) throw new InvalidOperationException("Escala alterada. Recarregue a consulta.");
        var previous = schedule is null ? null : new TeamWorkDay { TeamMemberId = id, Date = date,
            StartsAtUtc = schedule.StartsAtUtc, EndsAtUtc = schedule.EndsAtUtc, PlannedBreakMinutes = schedule.PlannedBreakMinutes, Revision = schedule.Revision };
        if (schedule is null) { schedule = new() { TeamMemberId = id, Date = date }; db.Add(schedule); }
        else schedule.Revision++;
        schedule.StartsAtUtc = start;
        schedule.EndsAtUtc = end;
        schedule.PlannedBreakMinutes = request.BreakMinutes;
        Audit(id, ownerId, "TeamWorkDaySaved", new { date, previous, start, end, request.BreakMinutes, schedule.Revision }, now);
        await Save(ct);
        var punches = await JournalForDay(id, date, ct);
        return Summarize(date, schedule, ActivePunches(punches).ToList(), now);
    }

    public async Task<TeamJournalRow> AppendAsync(int id, TeamJournalWrite request, int ownerId, DateTime now, CancellationToken ct)
    {
        var isPunch = IsPunch(request.Kind);
        await RequireMember(id, isPunch && request.ReplacesId is null, ct);
        if (request.RequestId == Guid.Empty || request.Date.Year is < 2000 or > 2100) throw new ArgumentException("Registro inválido.");
        var note = Clean(request.Note, 1000);
        var reference = Clean(request.Reference, 250);
        var amount = request.Amount;
        var rate = request.OvertimeHourlyRate;
        var at = request.AtLocal is DateTime local ? ToUtc(local) : now;
        if (at > now && (request.Kind != "Payment" || request.Status != "Planned"))
            throw new ArgumentException("A data do registro deve estar no passado ou no horário atual.");
        if (request.Kind == "PayPolicy")
        {
            if (request.Date.Day != 1 || request.Status is not ("Monthly" or "Hourly") || !Money(amount, false) || !Money(rate, true))
                throw new ArgumentException("Informe competência, modalidade, remuneração e valor-hora extra contratual.");
        }
        else if (request.Kind == "Payment")
        {
            var adjustment = request.Status == "Adjustment";
            var validAmount = adjustment ? Money(amount is decimal value ? Math.Abs(value) : null, false) && note is not null : Money(amount, false);
            if (request.Date.Day != 1 || request.Status is not ("Planned" or "Paid" or "Adjustment") || !validAmount || rate is not null)
                throw new ArgumentException("Informe competência, valor válido e situação. Ajustes exigem motivo.");
        }
        else if (isPunch)
        {
            if (request.Status is not null || amount is not null || rate is not null || reference is not null)
                throw new ArgumentException("Campos financeiros não pertencem a marcações de ponto.");
            var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(at, OperationalZone));
            if (localDate != request.Date && (request.Kind == "In" || localDate != request.Date.AddDays(1)))
                throw new ArgumentException("A marcação deve pertencer ao turno indicado.");
        }
        else if (request.Kind is "Recognition" or "Occurrence" or "Note" or "Caveat" or "Adjustment")
        {
            if (note is null || amount is not null || rate is not null || request.Status is not null)
                throw new ArgumentException("Informe a observação do registro administrativo.");
        }
        else throw new ArgumentException("Tipo de registro inválido.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var existing = await db.Set<TeamJournalEntry>().FindAsync([request.RequestId], ct);
        if (existing is not null)
        {
            if (existing.TeamMemberId != id || existing.OwnerId != ownerId || existing.Date != request.Date ||
                existing.Kind != request.Kind || existing.ReplacesId != request.ReplacesId || existing.Note != note || existing.Reference != reference ||
                existing.Amount != amount || existing.OvertimeHourlyRate != rate || existing.Status != request.Status ||
                (request.AtLocal.HasValue && existing.AtUtc != at)) throw new InvalidOperationException("Identificador de requisição já utilizado.");
            return Row(existing);
        }
        var journal = await JournalForDay(id, request.Date, ct);
        if (request.ReplacesId is Guid original && (!isPunch || note is null || journal.All(x => x.Id != original || x.Kind != request.Kind) || journal.Any(x => x.ReplacesId == original)))
            throw new InvalidOperationException("Para corrigir uma marcação atual, indique a marcação e um motivo.");
        var entry = new TeamJournalEntry { Id = request.RequestId, TeamMemberId = id, Date = request.Date, Kind = request.Kind,
            AtUtc = at, RecordedAtUtc = now, OwnerId = ownerId, Note = note, ReplacesId = request.ReplacesId,
            Amount = amount, OvertimeHourlyRate = rate, Reference = reference, Status = request.Status };
        if (isPunch && !ValidSequence(ActivePunches(journal.Append(entry)).ToList()))
            throw new InvalidOperationException("A sequência deve começar com entrada e encerrar intervalos antes da saída.");
        db.Add(entry);
        Audit(id, ownerId, "TeamJournalEntryAdded", new { entry.Id, entry.Kind, entry.ReplacesId, entry.Date }, now);
        await Save(ct);
        await transaction.CommitAsync(ct);
        return Row(entry);
    }

    private async Task RequireMember(int id, bool active, CancellationToken ct)
    {
        if (!await db.Set<TeamMember>().AnyAsync(x => x.Id == id && (!active || x.Active), ct))
            throw new KeyNotFoundException("Colaborador indisponível.");
    }

    private Task<List<TeamJournalEntry>> JournalForDay(int id, DateOnly date, CancellationToken ct) =>
        db.Set<TeamJournalEntry>().AsNoTracking().Where(x => x.TeamMemberId == id && x.Date == date).ToListAsync(ct);

    private async Task Save(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new InvalidOperationException("Registro atualizado por outro operador. Recarregue a consulta."); }
        catch (DbUpdateException e) when (e.InnerException is Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 19 } or Npgsql.PostgresException { SqlState: Npgsql.PostgresErrorCodes.UniqueViolation })
        { throw new InvalidOperationException("Registro concorrente ou duplicado. Recarregue a consulta."); }
    }

    private void Audit(int id, int ownerId, string action, object changes, DateTime now) =>
        db.AdminAuditLogs.Add(new(ownerId, "Admin", action, "TeamMember", id.ToString(), JsonSerializer.Serialize(changes), now));

    private static TeamJournalRow Row(TeamJournalEntry x) => new(x.Id, x.Kind, x.Date, Utc(x.AtUtc), Utc(x.RecordedAtUtc),
        x.OwnerId, x.ReplacesId, x.Note, x.Amount, x.OvertimeHourlyRate, x.Status, x.Reference);

    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);
    private static DateTime ToUtc(DateTime local)
    {
        if (local.Kind != DateTimeKind.Unspecified || OperationalZone.IsInvalidTime(local) || OperationalZone.IsAmbiguousTime(local))
            throw new ArgumentException("Horário local inválido ou ambíguo.");
        return TimeZoneInfo.ConvertTimeToUtc(local, OperationalZone);
    }

    private static string? Clean(string? text, int maximum)
    {
        var value = text?.Trim();
        if (value?.Length > maximum) throw new ArgumentException("Texto acima do limite.");
        return string.IsNullOrEmpty(value) ? null : value;
    }

    private static bool Money(decimal? value, bool optional) => value is null ? optional :
        value > 0 && value < 1_000_000m && decimal.Round(value.Value, 2) == value;
    private static bool IsPunch(string kind) => kind is "In" or "BreakStart" or "BreakEnd" or "Out";
    private static IEnumerable<TeamJournalEntry> ActivePunches(IEnumerable<TeamJournalEntry> entries)
    {
        var punches = entries.Where(x => IsPunch(x.Kind)).ToList();
        var replaced = punches.Where(x => x.ReplacesId.HasValue).Select(x => x.ReplacesId!.Value).ToHashSet();
        return punches.Where(x => !replaced.Contains(x.Id)).OrderBy(x => x.AtUtc);
    }

    private static bool ValidSequence(List<TeamJournalEntry> punches)
    {
        string? last = null;
        DateTime? lastAt = null;
        foreach (var punch in punches)
        {
            if (punch.AtUtc <= lastAt || (last, punch.Kind) is not
                ((null, "In") or ("In" or "BreakEnd", "BreakStart" or "Out") or ("BreakStart", "BreakEnd"))) return false;
            last = punch.Kind;
            lastAt = punch.AtUtc;
        }
        return true;
    }

    private static TeamDaySummary Summarize(DateOnly day, TeamWorkDay? schedule, List<TeamJournalEntry> punches, DateTime now)
    {
        var planned = schedule is null ? null : (int?)(schedule.EndsAtUtc - schedule.StartsAtUtc).TotalMinutes - schedule.PlannedBreakMinutes;
        var complete = punches.LastOrDefault()?.Kind == "Out";
        int? worked = complete ? (int)punches.Chunk(2).Sum(pair => (pair[1].AtUtc - pair[0].AtUtc).TotalMinutes) : null;
        var state = complete ? "Worked" : punches.Count > 0 ? "Open" : schedule?.EndsAtUtc < now ? "Absent" : "Scheduled";
        int? Delta(DateTime? from, DateTime? to) => from is DateTime a && to is DateTime b ? Math.Max(0, (int)(b - a).TotalMinutes) : null;
        var entry = punches.FirstOrDefault()?.AtUtc;
        return new(day, schedule is null ? null : Utc(schedule.StartsAtUtc), schedule is null ? null : Utc(schedule.EndsAtUtc),
            schedule?.PlannedBreakMinutes ?? 0, schedule?.Revision ?? 0, planned, worked,
            worked is int duration && planned is int expected ? Math.Max(0, duration - expected) : null,
            Delta(schedule?.StartsAtUtc, entry), Delta(entry, schedule?.StartsAtUtc),
            Delta(complete ? punches[^1].AtUtc : null, schedule?.EndsAtUtc), state);
    }
}
