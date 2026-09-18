using BurgerHouse.Application.Payments.GetPaymentStatus;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/payments")]
public sealed class PaymentsController(GetPaymentStatusHandler handler) : ControllerBase
{
    [HttpGet("{paymentId:int}")]
    public async Task<ActionResult<GetPaymentStatusResponse>> GetStatusAsync(int paymentId, CancellationToken cancellationToken)
    {
        try { return Ok(await handler.HandleAsync(paymentId, cancellationToken)); }
        catch (KeyNotFoundException) { return NotFound(new { error = "Payment was not found." }); }
        catch (ArgumentException) { return BadRequest(new { error = "Invalid payment id." }); }
    }
}
