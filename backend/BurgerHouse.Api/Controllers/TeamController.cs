using System.Security.Claims;
using BurgerHouse.Application.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController, Route("api/admin/team"), Authorize(Policy = "Owner"), AutoValidateAntiforgeryToken]
public sealed class TeamController(ITeamService service, ITeamOperationsService operations, TimeProvider clock) : ControllerBase
{
    private int OwnerId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet]
    public Task<TeamPage> List(string? search, bool? active, int page = 1, CancellationToken ct = default) =>
        service.ListAsync(search, active, page, ct);
    [HttpPost]
    public async Task<IActionResult> Create(TeamWrite request, CancellationToken ct) =>
        Ok(await service.CreateAsync(request, OwnerId, clock.GetUtcNow().UtcDateTime, ct));
    [HttpPut("{id:int:min(1)}")]
    public Task<TeamRow> Update(int id, TeamWrite request, CancellationToken ct) =>
        service.UpdateAsync(id, request, OwnerId, clock.GetUtcNow().UtcDateTime, ct);

    [HttpGet("{id:int:min(1)}/operations")]
    public Task<TeamMonth> Operations(int id, [FromQuery] DateOnly month, CancellationToken ct) =>
        operations.MonthAsync(id, month, clock.GetUtcNow().UtcDateTime, ct);

    [HttpPut("{id:int:min(1)}/work-days/{date}")]
    public Task<TeamDaySummary> Schedule(int id, DateOnly date, TeamWorkDayWrite request, CancellationToken ct) =>
        operations.ScheduleAsync(id, date, request, OwnerId, clock.GetUtcNow().UtcDateTime, ct);

    [HttpPost("{id:int:min(1)}/journal")]
    public Task<TeamJournalRow> Append(int id, TeamJournalWrite request, CancellationToken ct) =>
        operations.AppendAsync(id, request, OwnerId, clock.GetUtcNow().UtcDateTime, ct);
}
