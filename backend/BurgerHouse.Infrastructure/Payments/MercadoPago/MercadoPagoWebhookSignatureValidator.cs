using System.Security.Cryptography;
using System.Text;
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
        string? dataId)
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

        var normalizedSignature = xSignature.Trim();
        var normalizedRequestId = xRequestId.Trim();
        var normalizedDataId = dataId.Trim();

        try
        {
            WebhookSignatureValidator.Validate(
                xSignature: normalizedSignature,
                xRequestId: normalizedRequestId,
                dataId: normalizedDataId,
                secret: _webhookSecret
            );

            _logger?.LogInformation(
                "Mercado Pago webhook signature validated successfully. " +
                "DataId: {DataId}, RequestId: {RequestId}, SecretFingerprint: {SecretFingerprint}.",
                normalizedDataId,
                normalizedRequestId,
                GetSecretFingerprint()
            );

            return true;
        }
        catch (InvalidWebhookSignatureException exception)
        {
            var timestamp =
                GetSignatureValue(
                    normalizedSignature,
                    "ts"
                );

            var receivedV1 =
                GetSignatureValue(
                    normalizedSignature,
                    "v1"
                );

            var computedV1 =
                !string.IsNullOrWhiteSpace(timestamp)
                    ? ComputeExpectedSignature(
                        normalizedDataId,
                        normalizedRequestId,
                        timestamp
                    )
                    : null;

            _logger?.LogWarning(
                "Mercado Pago webhook signature validation failed. " +
                "Reason: {Reason}. " +
                "DataId: {DataId}. " +
                "RequestId: {RequestId}. " +
                "Timestamp: {Timestamp}. " +
                "ReceivedV1Prefix: {ReceivedV1Prefix}. " +
                "ComputedV1Prefix: {ComputedV1Prefix}. " +
                "SecretFingerprint: {SecretFingerprint}.",
                exception.Reason,
                normalizedDataId,
                normalizedRequestId,
                timestamp ?? "(missing)",
                GetPrefix(receivedV1),
                GetPrefix(computedV1),
                GetSecretFingerprint()
            );

            return false;
        }
    }

    private string ComputeExpectedSignature(
        string dataId,
        string requestId,
        string timestamp)
    {
        var manifest =
            $"id:{dataId};" +
            $"request-id:{requestId};" +
            $"ts:{timestamp};";

        var hash =
            HMACSHA256.HashData(
                Encoding.UTF8.GetBytes(_webhookSecret),
                Encoding.UTF8.GetBytes(manifest)
            );

        return Convert
            .ToHexString(hash)
            .ToLowerInvariant();
    }

    private string GetSecretFingerprint()
    {
        var hash =
            SHA256.HashData(
                Encoding.UTF8.GetBytes(_webhookSecret)
            );

        return Convert
            .ToHexString(hash)
            .ToLowerInvariant()[..12];
    }

    private static string? GetSignatureValue(
        string signature,
        string key)
    {
        foreach (var part in signature.Split(','))
        {
            var separatorIndex =
                part.IndexOf('=');

            if (separatorIndex <= 0 ||
                separatorIndex >= part.Length - 1)
            {
                continue;
            }

            var currentKey =
                part[..separatorIndex].Trim();

            var value =
                part[(separatorIndex + 1)..].Trim();

            if (string.Equals(
                    currentKey,
                    key,
                    StringComparison.OrdinalIgnoreCase))
            {
                return value;
            }
        }

        return null;
    }

    private static string GetPrefix(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "(missing)";
        }

        return value.Length <= 16
            ? value
            : value[..16];
    }
}