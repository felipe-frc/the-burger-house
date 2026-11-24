using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using BurgerHouse.Application.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController, Route("api/admin/agenda"), Authorize(Policy = "Owner"), AutoValidateAntiforgeryToken]
public sealed class AdminAgendaController(IAdminAgendaService service, TimeProvider clock) : ControllerBase
{
    private int Actor => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet]
    public Task<IReadOnlyList<AgendaRow>> List([Required] string start, [Required] string end, CancellationToken ct) =>
        service.ListAsync(start, end, ct);
    [HttpPost]
    public Task<AgendaRow> Create(AgendaCreateRequest request, CancellationToken ct) =>
        service.CreateAsync(request.Id, request.Draft, Actor, clock.GetUtcNow().UtcDateTime, ct);
    [HttpPut("{id}")]
    public Task<AgendaRow> Update(string id, AgendaUpdateRequest request, CancellationToken ct) =>
        service.UpdateAsync(id, request.Revision, request.Draft, Actor, clock.GetUtcNow().UtcDateTime, ct);
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, [Range(1, int.MaxValue)] int revision, CancellationToken ct)
    {
        await service.DeleteAsync(id, revision, Actor, clock.GetUtcNow().UtcDateTime, ct);
        return NoContent();
    }
}
public record AgendaCreateRequest([Required, StringLength(100)] string Id, [Required] AgendaDraft Draft);
public record AgendaUpdateRequest([Range(1, int.MaxValue)] int Revision, [Required] AgendaDraft Draft);
