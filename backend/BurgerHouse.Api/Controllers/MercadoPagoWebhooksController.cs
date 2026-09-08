using System.Text.Json;

using BurgerHouse.Api.Webhooks.MercadoPago;
using BurgerHouse.Infrastructure.Payments.MercadoPago;

using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/webhooks/mercadopago")]
public sealed class MercadoPagoWebhooksController : ControllerBase
{
    private readonly MercadoPagoWebhookSignatureValidator _signatureValidator;
    private readonly MercadoPagoOrderLookup _orderLookup;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<MercadoPagoWebhooksController> _logger;

    public MercadoPagoWebhooksController(
        MercadoPagoWebhookSignatureValidator signatureValidator,
        MercadoPagoOrderLookup orderLookup,
        IWebHostEnvironment environment,
        ILogger<MercadoPagoWebhooksController> logger)
    {
        _signatureValidator = signatureValidator;
        _orderLookup = orderLookup;
        _environment = environment;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Receive(
        [FromBody] MercadoPagoWebhookRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var xSignature =
            Request.Headers["x-signature"]
                .FirstOrDefault();

        var xRequestId =
            Request.Headers["x-request-id"]
                .FirstOrDefault();

        var signedDataId =
            Request.Query["data.id"]
                .FirstOrDefault();

        var notificationType =
            Request.Query["type"]
                .FirstOrDefault();

        var notificationId =
            request.Id.ValueKind switch
            {
                JsonValueKind.String =>
                    request.Id.GetString(),

                JsonValueKind.Number =>
                    request.Id.GetRawText(),

                _ => null
            };

        if (!string.IsNullOrWhiteSpace(request.Data?.Id) &&
            !string.Equals(
                request.Data.Id,
                signedDataId,
                StringComparison.Ordinal))
        {
            return BadRequest(new
            {
                error = "Webhook data id mismatch."
            });
        }

        var isValid = _signatureValidator.IsValid(
            xSignature,
            xRequestId,
            signedDataId,
            notificationId
        );

        if (!isValid)
        {
            if (!_environment.IsDevelopment() ||
                !string.Equals(
                    notificationType,
                    "order",
                    StringComparison.OrdinalIgnoreCase) ||
                string.IsNullOrWhiteSpace(signedDataId))
            {
                return Unauthorized(new
                {
                    error = "Invalid webhook signature."
                });
            }

            MercadoPagoOrderSnapshot? order;

            try
            {
                order = await _orderLookup.GetAsync(
                    signedDataId,
                    cancellationToken
                );
            }
            catch (HttpRequestException exception)
            {
                _logger.LogWarning(
                    exception,
                    "Mercado Pago Sandbox order verification failed."
                );

                return StatusCode(
                    StatusCodes.Status502BadGateway,
                    new
                    {
                        error = "Could not verify Mercado Pago order."
                    }
                );
            }

            if (order is null ||
                !string.Equals(
                    order.Id,
                    signedDataId,
                    StringComparison.Ordinal))
            {
                _logger.LogWarning(
                    "Mercado Pago Sandbox webhook could not be verified " +
                    "through the Orders API."
                );

                return Unauthorized(new
                {
                    error = "Invalid webhook signature."
                });
            }

            _logger.LogWarning(
                "Mercado Pago Sandbox webhook signature failed, but " +
                "Order {OrderId} was verified directly through the " +
                "Mercado Pago API. Status: {Status}.",
                order.Id,
                order.Status ?? "(missing)"
            );

            return Ok(new
            {
                received = true,
                sandboxFallback = true,
                verifiedBy = "mercado-pago-orders-api"
            });
        }

        if (!string.Equals(
                notificationType,
                "order",
                StringComparison.OrdinalIgnoreCase))
        {
            return Ok(new
            {
                received = true,
                ignored = true
            });
        }

        return Ok(new
        {
            received = true
        });
    }
}