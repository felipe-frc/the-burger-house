namespace BurgerHouse.Application.Admin;

public record AgendaDraft(string Title, string? Description, string Date, string StartTime,
    string EndTime, string Category, string Status, string? Notes);
public record AgendaRow(string Id, string Title, string Description, string Date, string StartTime,
    string EndTime, string Category, string Status, string Notes, DateTime CreatedAt, DateTime UpdatedAt, int Revision);
public interface IAdminAgendaService
{
    Task<IReadOnlyList<AgendaRow>> ListAsync(string start, string end, CancellationToken ct);
    Task<AgendaRow> CreateAsync(string id, AgendaDraft draft, int actor, DateTime now, CancellationToken ct);
    Task<AgendaRow> UpdateAsync(string id, int revision, AgendaDraft draft, int actor, DateTime now, CancellationToken ct);
    Task DeleteAsync(string id, int revision, int actor, DateTime now, CancellationToken ct);
}
