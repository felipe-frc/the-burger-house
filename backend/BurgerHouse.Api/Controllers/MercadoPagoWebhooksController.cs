using System.Text.Json;

using BurgerHouse.Api.Webhooks.MercadoPago;
using BurgerHouse.Application.Payments.SynchronizePaymentStatus;
using BurgerHouse.Infrastructure.Payments.MercadoPago;

using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/webhooks/mercadopago")]
public sealed class MercadoPagoWebhooksController : ControllerBase
{
    private readonly MercadoPagoWebhookSignatureValidator _signatureValidator;
    private readonly MercadoPagoOrderLookup _orderLookup;
    private readonly SynchronizePaymentStatusHandler _synchronizePaymentStatusHandler;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<MercadoPagoWebhooksController> _logger;

    public MercadoPagoWebhooksController(
        MercadoPagoWebhookSignatureValidator signatureValidator,
        MercadoPagoOrderLookup orderLookup,
        SynchronizePaymentStatusHandler synchronizePaymentStatusHandler,
        IWebHostEnvironment environment,
        ILogger<MercadoPagoWebhooksController> logger)
    {
        _signatureValidator = signatureValidator;
        _orderLookup = orderLookup;
        _synchronizePaymentStatusHandler =
            synchronizePaymentStatusHandler;
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

        var sandboxFallback = false;

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

            sandboxFallback = true;
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

        if (string.IsNullOrWhiteSpace(signedDataId))
        {
            return BadRequest(new
            {
                error = "Webhook order id is required."
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
                "Mercado Pago order verification failed."
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
            if (sandboxFallback)
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
                "Mercado Pago webhook Order {OrderId} " +
                "could not be verified through the Orders API.",
                signedDataId
            );

            return StatusCode(
                StatusCodes.Status502BadGateway,
                new
                {
                    error = "Could not verify Mercado Pago order."
                }
            );
        }

        if (sandboxFallback)
        {
            _logger.LogWarning(
                "Mercado Pago Sandbox webhook signature failed, but " +
                "Order {OrderId} was verified directly through the " +
                "Mercado Pago API. Status: {Status}. Detail: {StatusDetail}.",
                order.Id,
                order.ProviderStatus,
                order.ProviderStatusDetail ?? "(missing)"
            );
        }

        bool changed;

        try
        {
            changed =
                await _synchronizePaymentStatusHandler.HandleAsync(
                    order.Id,
                    order.PaymentStatus,
                    cancellationToken
                );
        }
        catch (KeyNotFoundException exception)
        {
            _logger.LogWarning(
                exception,
                "Local payment for Mercado Pago Order {OrderId} " +
                "was not found.",
                order.Id
            );

            return Conflict(new
            {
                error = "Local payment was not found."
            });
        }
        catch (InvalidOperationException exception)
        {
            _logger.LogWarning(
                exception,
                "Mercado Pago Order {OrderId} could not be " +
                "synchronized with the local payment.",
                order.Id
            );

            return Conflict(new
            {
                error = "Payment status could not be synchronized."
            });
        }

        if (sandboxFallback)
        {
            return Ok(new
            {
                received = true,
                synchronized = changed,
                sandboxFallback = true,
                verifiedBy = "mercado-pago-orders-api"
            });
        }

        return Ok(new
        {
            received = true,
            synchronized = changed
        });
    }
}