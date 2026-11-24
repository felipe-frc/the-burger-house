using System.Security.Claims;
using BurgerHouse.Application.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BurgerHouse.Api.Controllers;

[ApiController, Route("api/admin/delivery-tracking"), Authorize(Policy = "Owner"), AutoValidateAntiforgeryToken]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class DeliveryTrackingController(IDeliveryTrackingService service, TimeProvider clock) : ControllerBase
{
    private int OwnerId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet("couriers")]
    public Task<IReadOnlyList<CourierOption>> Couriers(CancellationToken ct) => service.CouriersAsync(ct);
    [HttpGet("{id:int:min(1)}")]
    public Task<DeliveryTrackingState> Status(int id, CancellationToken ct) => service.StatusAsync(id, clock.GetUtcNow().UtcDateTime, ct);
    [HttpPost("{id:int:min(1)}")]
    public Task<DeliveryTrackingGrant> Grant(int id, DeliveryTrackingWrite request, CancellationToken ct) =>
        service.GrantAsync(id, request.CourierId, OwnerId, clock.GetUtcNow().UtcDateTime, ct);
    [HttpDelete("{id:int:min(1)}")]
    public async Task<IActionResult> Revoke(int id, CancellationToken ct)
    {
        await service.RevokeAsync(id, OwnerId, clock.GetUtcNow().UtcDateTime, ct);
        return NoContent();
    }
}

[ApiController, Route("api/courier/tracking/{id:int:min(1)}"), EnableRateLimiting("CourierTracking")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class CourierPositionController(IDeliveryTrackingService service, TimeProvider clock) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Start(int id, CancellationToken ct)
    {
        var token = Bearer();
        if (token is null) return Unauthorized();
        var runId = await service.StartAsync(id, token, clock.GetUtcNow().UtcDateTime, ct);
        return runId is Guid key ? Ok(new { RunId = key }) : Unauthorized();
    }
    [HttpPut]
    public Task<IActionResult> Report(int id, CourierPositionWrite position, CancellationToken ct) => Update(id, position, ct);
    [HttpDelete]
    public Task<IActionResult> Stop(int id, CancellationToken ct) => Update(id, null, ct);

    private async Task<IActionResult> Update(int id, CourierPositionWrite? position, CancellationToken ct)
    {
        var token = Bearer();
        if (token is null) return Unauthorized();
        try
        {
            var outcome = await service.ReportAsync(id, token, position, clock.GetUtcNow().UtcDateTime, ct);
            return outcome switch
            {
                CourierTrackingResult.Unauthorized => Unauthorized(),
                CourierTrackingResult.Ended => StatusCode(410),
                CourierTrackingResult.TooFast => StatusCode(429),
                _ => NoContent()
            };
        }
        catch (ArgumentException) { return BadRequest(new { error = "Posição inválida ou antiga." }); }
    }

    private string? Bearer()
    {
        const string prefix = "Bearer ";
        var authorization = Request.Headers.Authorization.ToString();
        return authorization.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? authorization[prefix.Length..] : null;
    }
}
