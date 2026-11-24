using System.Security.Claims;
using BurgerHouse.Application.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController, Route("api/admin/stock"), Authorize(Policy = "Owner"), AutoValidateAntiforgeryToken]
public sealed class AdminStockController(IAdminStockService service) : ControllerBase
{
    private int Actor => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet]
    public Task<IReadOnlyList<StockRow>> List(CancellationToken ct) => service.ListAsync(ct);
    [HttpPost]
    public Task<StockRow> Create(StockDraft draft, CancellationToken ct) => service.CreateAsync(draft, Actor, ct);
    [HttpPost("{id:int:min(1)}/movements")]
    public async Task<IActionResult> Move(int id, StockMove move, CancellationToken ct)
    {
        await service.MoveAsync(id, move, Actor, ct);
        return NoContent();
    }
    [HttpGet("{id:int:min(1)}/movements")]
    public Task<IReadOnlyList<StockHistory>> History(int id, int page = 1, CancellationToken ct = default) => service.HistoryAsync(id, page, ct);
}
