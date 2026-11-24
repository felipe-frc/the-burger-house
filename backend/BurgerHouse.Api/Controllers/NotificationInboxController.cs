using System.Security.Claims;
using BurgerHouse.Application.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController, Route("api/admin/notifications/inbox"), Authorize(Policy = "Owner"), AutoValidateAntiforgeryToken]
public sealed class NotificationInboxController(INotificationInboxService inbox) : ControllerBase
{
    private int OwnerId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public Task<NotificationInbox> List(int? beforeId, CancellationToken ct) => inbox.ListAsync(OwnerId, beforeId, ct);

    [HttpPut("{orderId:int:min(1)}/read")]
    public async Task<IActionResult> Read(int orderId, CancellationToken ct)
    {
        await inbox.UpdateAsync(OwnerId, orderId, false, ct);
        return NoContent();
    }

    [HttpPut("read")]
    public async Task<IActionResult> ReadAll(CancellationToken ct)
    {
        await inbox.UpdateAsync(OwnerId, null, false, ct);
        return NoContent();
    }

    [HttpPut("{orderId:int:min(1)}/archive")]
    public async Task<IActionResult> Archive(int orderId, CancellationToken ct)
    {
        await inbox.UpdateAsync(OwnerId, orderId, true, ct);
        return NoContent();
    }
}
