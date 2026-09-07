using MercadoPago.Error;
using MercadoPago.Webhook;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoWebhookSignatureValidator
{
    private readonly string _webhookSecret;

    public MercadoPagoWebhookSignatureValidator(
        IOptions<MercadoPagoOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);

        var webhookSecret =
            options.Value.WebhookSecret?.Trim();

        if (string.IsNullOrWhiteSpace(webhookSecret))
        {
            throw new InvalidOperationException(
                "Mercado Pago webhook secret was not configured."
            );
        }

        _webhookSecret = webhookSecret;
    }

    public bool IsValid(
        string? xSignature,
        string? xRequestId,
        string? dataId)
    {
        if (string.IsNullOrWhiteSpace(xSignature) ||
            string.IsNullOrWhiteSpace(xRequestId) ||
            string.IsNullOrWhiteSpace(dataId))
        {
            return false;
        }

        try
        {
            WebhookSignatureValidator.Validate(
                xSignature: xSignature.Trim(),
                xRequestId: xRequestId.Trim(),
                dataId: dataId.Trim(),
                secret: _webhookSecret
            );

            return true;
        }
        catch (InvalidWebhookSignatureException)
        {
            return false;
        }
    }
}