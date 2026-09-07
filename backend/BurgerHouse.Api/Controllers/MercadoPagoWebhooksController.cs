using BurgerHouse.Api.Webhooks.MercadoPago;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/webhooks/mercadopago")]
public sealed class MercadoPagoWebhooksController : ControllerBase
{
    private readonly MercadoPagoWebhookSignatureValidator
        _signatureValidator;

    public MercadoPagoWebhooksController(
        MercadoPagoWebhookSignatureValidator signatureValidator)
    {
        _signatureValidator = signatureValidator;
    }

    [HttpPost]
    public IActionResult Receive(
        [FromBody] MercadoPagoWebhookRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var xSignature =
            Request.Headers["x-signature"]
                .FirstOrDefault();

        var xRequestId =
            Request.Headers["x-request-id"]
                .FirstOrDefault();

        // O Mercado Pago assina o data.id recebido
        // na QUERY STRING, não o valor do body.
        var signedDataId =
            Request.Query["data.id"]
                .FirstOrDefault();

        var notificationType =
            Request.Query["type"]
                .FirstOrDefault();

        var isValid = _signatureValidator.IsValid(
            xSignature,
            xRequestId,
            signedDataId
        );

        if (!isValid)
        {
            return Unauthorized(new
            {
                error = "Invalid webhook signature."
            });
        }

        // Só depois da assinatura validada,
        // verificamos se body e query se referem
        // ao mesmo recurso.
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