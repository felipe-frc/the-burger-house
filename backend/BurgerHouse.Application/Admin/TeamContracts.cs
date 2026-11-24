namespace BurgerHouse.Application.Admin;

public record TeamRow(int Id, string Name, string Email, string Role, string Department, string Shift, bool Active, int Revision);
public record TeamWrite(string Name, string Email, string Role, string Department, string Shift, bool Active = true, int Revision = 0);
public record TeamPage(IReadOnlyList<TeamRow> Items, int Total, int Page, int PageSize);
public interface ITeamService
{
    Task<TeamPage> ListAsync(string? search, bool? active, int page, CancellationToken ct);
    Task<TeamRow> CreateAsync(TeamWrite request, int ownerId, DateTime now, CancellationToken ct);
    Task<TeamRow> UpdateAsync(int id, TeamWrite request, int ownerId, DateTime now, CancellationToken ct);
}
