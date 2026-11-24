using System.Globalization;
using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed class AdminAgendaService(BurgerHouseDbContext db) : IAdminAgendaService
{
    public async Task<IReadOnlyList<AgendaRow>> ListAsync(string start, string end, CancellationToken ct)
    {
        if (!DateOnly.TryParseExact(start, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var from) ||
            !DateOnly.TryParseExact(end, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var to) ||
            to < from || to.DayNumber - from.DayNumber > 366) throw new ArgumentException("Invalid range.");
        var rows = await db.Set<AdminAgendaEvent>().AsNoTracking()
            .Where(e => !e.Deleted && string.Compare(e.Date, start) >= 0 && string.Compare(e.Date, end) <= 0)
            .OrderBy(e => e.Date).ThenBy(e => e.StartTime).ThenBy(e => e.Id).ToListAsync(ct);
        return rows.Select(Row).ToList();
    }

    public async Task<AgendaRow> CreateAsync(string id, AgendaDraft draft, int actor, DateTime now, CancellationToken ct)
    {
        var candidate = new AdminAgendaEvent(id, draft.Title, draft.Description ?? "", draft.Date,
            draft.StartTime, draft.EndTime, draft.Category, draft.Status, draft.Notes ?? "", now);
        var existing = await db.Set<AdminAgendaEvent>().FindAsync([id], ct);
        if (existing != null)
        {
            if (existing.Deleted || Draft(existing) != Draft(candidate)) throw new InvalidOperationException("Identifier already exists.");
            return Row(existing);
        }
        db.Add(candidate);
        Audit(candidate, "AgendaCreated", actor, now);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException error) when (error.InnerException is Microsoft.Data.Sqlite.SqliteException
            { SqliteExtendedErrorCode: 1555 or 2067 } or Npgsql.PostgresException { SqlState: Npgsql.PostgresErrorCodes.UniqueViolation })
        {
            throw new InvalidOperationException("Concurrent creation. Reload before retrying.", error);
        }
        return Row(candidate);
    }

    public async Task<AgendaRow> UpdateAsync(string id, int revision, AgendaDraft draft, int actor, DateTime now, CancellationToken ct)
    {
        var entity = await Find(id, revision, ct);
        entity.Update(draft.Title, draft.Description ?? "", draft.Date, draft.StartTime, draft.EndTime,
            draft.Category, draft.Status, draft.Notes ?? "", now);
        Audit(entity, "AgendaUpdated", actor, now);
        await Save(ct);
        return Row(entity);
    }

    public async Task DeleteAsync(string id, int revision, int actor, DateTime now, CancellationToken ct)
    {
        var entity = await Find(id, revision, ct);
        entity.Delete(now);
        Audit(entity, "AgendaDeleted", actor, now);
        await Save(ct);
    }

    private async Task<AdminAgendaEvent> Find(string id, int revision, CancellationToken ct)
    {
        var entity = await db.Set<AdminAgendaEvent>().FindAsync([id], ct) ?? throw new KeyNotFoundException();
        if (entity.Deleted || entity.Revision != revision) throw new InvalidOperationException("Event changed.");
        return entity;
    }

    private async Task Save(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new InvalidOperationException("Event changed."); }
    }

    private void Audit(AdminAgendaEvent entity, string action, int actor, DateTime now) =>
        db.AdminAuditLogs.Add(new(actor, "Admin", action, "AgendaEvent", entity.Id,
            JsonSerializer.Serialize(new { entity.Revision, entity.Deleted }), now));
    private static AgendaDraft Draft(AdminAgendaEvent e) => new(e.Title, e.Description, e.Date, e.StartTime, e.EndTime, e.Category, e.Status, e.Notes);
    private static AgendaRow Row(AdminAgendaEvent e) => new(e.Id, e.Title, e.Description, e.Date, e.StartTime, e.EndTime, e.Category, e.Status, e.Notes, e.CreatedAt, e.UpdatedAt, e.Revision);
}
