using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/checkout")]
public sealed class CheckoutController(
    PrepareCheckoutPaymentHandler prepareCheckoutPaymentHandler,
    IHostedCheckoutGateway hostedCheckoutGateway,
    BurgerHouseDbContext dbContext) : ControllerBase
{
    [HttpPost("{orderId:int}")]
    public async Task<IActionResult> CreateCheckoutAsync(int orderId, CancellationToken cancellationToken)
    {
        if (orderId <= 0) return BadRequest(new { error = "Order id must be greater than zero." });
        try
        {
            // Commit the local identity before sending it to the provider, even if checkout creation fails.
            int paymentId;
            await using (var preparation = await dbContext.Database.BeginTransactionAsync(cancellationToken))
            {
                var prepared = await prepareCheckoutPaymentHandler.HandleAsync(
                    orderId,
                    hostedCheckoutGateway.Provider,
                    cancellationToken
                );
                paymentId = prepared.Id;
                await preparation.CommitAsync(cancellationToken);
            }
            dbContext.ChangeTracker.Clear();
            // SQLite serializes writers before reading, including simultaneous checkout requests.
            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            var payment = await dbContext.Payments.SingleAsync(p => p.Id == paymentId, cancellationToken);
            if (payment.Status != Domain.Enums.PaymentStatus.Pending)
                return Conflict(new { error = "Payment is no longer pending." });
            var checkout = await hostedCheckoutGateway.GetOrCreateAsync(payment, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Ok(new
            {
                paymentId = payment.Id,
                checkoutUrl = checkout.CheckoutUrl,
                initPoint = checkout.CheckoutUrl
            });
        }
        catch (KeyNotFoundException) { return NotFound(new { error = "Order was not found." }); }
        catch (InvalidOperationException exception) { return Conflict(new { error = exception.Message }); }
        catch (HttpRequestException) { return ProviderUnavailable(); }
        catch (System.Text.Json.JsonException) { return ProviderUnavailable(); }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return ProviderUnavailable(); }
        catch (DbUpdateException) { return Conflict(new { error = "Checkout is being updated. Please retry." }); }
        catch (SqliteException) { return StatusCode(503, new { error = "Checkout is temporarily unavailable. Please retry." }); }
    }

    private ObjectResult ProviderUnavailable() => StatusCode(502, new { error = "Could not prepare hosted checkout." });
}
