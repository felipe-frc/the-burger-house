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

        var dataId = request.Data?.Id;

        var isValid = _signatureValidator.IsValid(
            xSignature,
            xRequestId,
            dataId
        );

        if (!isValid)
        {
            return Unauthorized(new
            {
                error = "Invalid webhook signature."
            });
        }

        if (!string.Equals(
                request.Type,
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