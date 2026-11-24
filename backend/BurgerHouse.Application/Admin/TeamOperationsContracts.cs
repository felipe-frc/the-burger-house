namespace BurgerHouse.Application.Admin;

public record TeamWorkDayWrite(TimeOnly Start, TimeOnly End, int BreakMinutes, int Revision);
public record TeamJournalWrite(Guid RequestId, string Kind, DateOnly Date, DateTime? AtLocal, string? Note,
    Guid? ReplacesId, decimal? Amount, decimal? OvertimeHourlyRate, string? Status, string? Reference);
public record TeamJournalRow(Guid Id, string Kind, DateOnly Date, DateTime AtUtc, DateTime RecordedAtUtc,
    int OwnerId, Guid? ReplacesId, string? Note, decimal? Amount, decimal? OvertimeHourlyRate, string? Status, string? Reference)
{
    public string Origin => "Owner";
}
public record TeamDaySummary(DateOnly Date, DateTime? StartsAtUtc, DateTime? EndsAtUtc, int PlannedBreakMinutes,
    int Revision, int? PlannedMinutes, int? WorkedMinutes, int? ExtraMinutes, int? LateMinutes,
    int? EarlyEntryMinutes, int? EarlyExitMinutes, string State);
public record TeamMonth(IReadOnlyList<TeamDaySummary> Days, IReadOnlyList<TeamJournalRow> Entries,
    int WorkedMinutes, int ExtraMinutes, int Absences, int LateDays, int WorkedDays, decimal? ExtraAmount, TeamJournalRow? PayPolicy);

public interface ITeamOperationsService
{
    Task<TeamMonth> MonthAsync(int id, DateOnly month, DateTime now, CancellationToken ct);
    Task<TeamDaySummary> ScheduleAsync(int id, DateOnly date, TeamWorkDayWrite request, int ownerId, DateTime now, CancellationToken ct);
    Task<TeamJournalRow> AppendAsync(int id, TeamJournalWrite request, int ownerId, DateTime now, CancellationToken ct);
}
