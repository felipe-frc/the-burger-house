using MercadoPago.Error;
using MercadoPago.Webhook;

using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoWebhookSignatureValidator
{
    private readonly string _webhookSecret;
    private readonly ILogger<MercadoPagoWebhookSignatureValidator>? _logger;

    public MercadoPagoWebhookSignatureValidator(
        IOptions<MercadoPagoOptions> options,
        ILogger<MercadoPagoWebhookSignatureValidator>? logger = null)
    {
        ArgumentNullException.ThrowIfNull(options);

        var webhookSecret =
            options.Value.WebhookSecret;

        if (string.IsNullOrWhiteSpace(webhookSecret))
        {
            throw new InvalidOperationException(
                "Mercado Pago webhook secret was not configured."
            );
        }

        _webhookSecret = webhookSecret;
        _logger = logger;
    }

    public bool IsValid(
        string? xSignature,
        string? xRequestId,
        string? dataId,
        string? notificationId = null)
    {
        if (string.IsNullOrWhiteSpace(xSignature) ||
            string.IsNullOrWhiteSpace(xRequestId) ||
            string.IsNullOrWhiteSpace(dataId))
        {
            _logger?.LogWarning(
                "Mercado Pago webhook validation missing required data. " +
                "SignaturePresent: {SignaturePresent}, " +
                "RequestIdPresent: {RequestIdPresent}, " +
                "DataIdPresent: {DataIdPresent}.",
                !string.IsNullOrWhiteSpace(xSignature),
                !string.IsNullOrWhiteSpace(xRequestId),
                !string.IsNullOrWhiteSpace(dataId)
            );

            return false;
        }

        try
        {
            WebhookSignatureValidator.Validate(
                xSignature: xSignature,
                xRequestId: xRequestId,
                dataId: dataId,
                secret: _webhookSecret
            );

            return true;
        }
        catch (InvalidWebhookSignatureException exception)
        {
            _logger?.LogWarning(
                "Mercado Pago webhook signature validation failed. " +
                "Reason: {Reason}.",
                exception.Reason
            );

            return false;
        }
    }
}