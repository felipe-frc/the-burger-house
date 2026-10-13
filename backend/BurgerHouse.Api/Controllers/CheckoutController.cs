using BurgerHouse.Application.Payments.CreateHostedCheckout;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/checkout")]
public sealed class CheckoutController(
    CreateHostedCheckoutHandler createHostedCheckoutHandler)
    : ControllerBase
{
    [HttpPost("{orderId:int}")]
    public async Task<IActionResult> CreateCheckoutAsync(
        int orderId,
        CancellationToken cancellationToken)
    {
        if (orderId <= 0)
        {
            return BadRequest(
                new
                {
                    error =
                        "Order id must be greater than zero."
                }
            );
        }

        try
        {
            var checkout =
                await createHostedCheckoutHandler.HandleAsync(
                    orderId,
                    cancellationToken
                );

            return Ok(
                new
                {
                    paymentId =
                        checkout.PaymentId,

                    checkoutUrl =
                        checkout.CheckoutUrl
                }
            );
        }
        catch (KeyNotFoundException)
        {
            return NotFound(
                new
                {
                    error =
                        "Order was not found."
                }
            );
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(
                new
                {
                    error =
                        exception.Message
                }
            );
        }
        catch (HttpRequestException)
        {
            return ProviderUnavailable();
        }
        catch (System.Text.Json.JsonException)
        {
            return ProviderUnavailable();
        }
        catch (TaskCanceledException)
            when (!cancellationToken.IsCancellationRequested)
        {
            return ProviderUnavailable();
        }
        catch (DbUpdateException)
        {
            return Conflict(
                new
                {
                    error =
                        "Checkout is being updated. Please retry."
                }
            );
        }
        catch (SqliteException)
        {
            return StatusCode(
                503,
                new
                {
                    error =
                        "Checkout is temporarily unavailable. Please retry."
                }
            );
        }
    }

    private ObjectResult ProviderUnavailable()
    {
        return StatusCode(
            502,
            new
            {
                error =
                    "Could not prepare hosted checkout."
            }
        );
    }
}