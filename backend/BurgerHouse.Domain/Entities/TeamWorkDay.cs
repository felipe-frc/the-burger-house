namespace BurgerHouse.Domain.Entities;

public sealed class TeamWorkDay
{
    public int TeamMemberId { get; init; }
    public DateOnly Date { get; init; }
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public int PlannedBreakMinutes { get; set; }
    public int Revision { get; set; } = 1;
}

public sealed class TeamJournalEntry
{
    public Guid Id { get; init; }
    public int TeamMemberId { get; init; }
    public DateOnly Date { get; init; }
    public string Kind { get; init; } = "";
    public DateTime AtUtc { get; init; }
    public DateTime RecordedAtUtc { get; init; }
    public int OwnerId { get; init; }
    public Guid? ReplacesId { get; init; }
    public string? Note { get; init; }
    public string? Reference { get; init; }
    public decimal? Amount { get; init; }
    public decimal? OvertimeHourlyRate { get; init; }
    public string? Status { get; init; }
}
