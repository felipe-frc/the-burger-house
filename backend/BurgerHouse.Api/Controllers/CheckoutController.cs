using BurgerHouse.Infrastructure.Orders;
using BurgerHouse.Application.Payments.CreateHostedCheckout;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using Microsoft.AspNetCore.Mvc;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/checkout")]
[Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("StorefrontWrite")]
public sealed class CheckoutController(
    CreateHostedCheckoutHandler createHostedCheckoutHandler, OrderPricingService? pricing = null,
    IConfiguration? configuration = null)
    : ControllerBase
{
    [HttpPost("{orderId:int}")]
    public async Task<IActionResult> CreateCheckoutAsync(
        int orderId,
        CancellationToken cancellationToken)
    {
        if (configuration?.GetValue<bool>("Portfolio:Enabled") == true &&
            !configuration.GetValue<bool>("PagBank:EnablePortfolioSandbox"))
            return StatusCode(503, new { error = "Checkout sandbox desativado neste início local. Configure sua credencial privada e inicie sem -Offline." });
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
            if (pricing != null) await pricing.ValidateCheckoutAsync(orderId, cancellationToken);
            var checkout =
                await createHostedCheckoutHandler.HandleAsync(
                    orderId,
                    cancellationToken
                );

            if (configuration?.GetValue<bool>("Portfolio:Enabled") == true)
                return Ok(new { paymentId = checkout.PaymentId, checkoutUrl = checkout.CheckoutUrl, keepStoreOpen = true });
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
        catch (CancelledCheckoutOrderException exception)
        {
            return Conflict(new { error = exception.Message, code = "order_cancelled" });
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new { error = exception.Message });
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
        catch (DbException)
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
