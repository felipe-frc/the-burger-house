using System.Net.Http.Json;
using System.Text.Json;

using BurgerHouse.Application.Abstractions.Payments;

using Microsoft.Extensions.Logging;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoPaymentGateway
    : IPaymentGateway
{
    private readonly HttpClient _httpClient;

    private readonly
        ILogger<MercadoPagoPaymentGateway>? _logger;

    public MercadoPagoPaymentGateway(
        HttpClient httpClient,
        ILogger<MercadoPagoPaymentGateway>? logger = null)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<PaymentGatewayResult> ProcessAsync(
        PaymentGatewayRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(
                request.IdempotencyKey))
        {
            throw new ArgumentException(
                "Idempotency key cannot be empty."
            );
        }

        var normalizedIdempotencyKey =
            request.IdempotencyKey.Trim();

        if (!Guid.TryParseExact(
                normalizedIdempotencyKey,
                "D",
                out var parsedIdempotencyKey))
        {
            throw new ArgumentException(
                "Idempotency key must be a valid UUID."
            );
        }

        var mercadoPagoRequest =
            MercadoPagoRequestFactory.Create(
                request
            );

        using var httpRequest =
            new HttpRequestMessage(
                HttpMethod.Post,
                "v1/orders"
            );

        httpRequest.Headers.Add(
            "X-Idempotency-Key",
            parsedIdempotencyKey.ToString("D")
        );

        httpRequest.Content =
            JsonContent.Create(
                mercadoPagoRequest
            );

        using var httpResponse =
            await _httpClient.SendAsync(
                httpRequest,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken
            );

        if (!httpResponse.IsSuccessStatusCode)
        {
            var errorBody =
                await httpResponse.Content
                    .ReadAsStringAsync(
                        cancellationToken
                    );

            var safeProviderError =
                ExtractSafeProviderError(
                    errorBody
                );

            _logger?.LogWarning(
                "Mercado Pago rejected payment request. " +
                "StatusCode: {StatusCode}. " +
                "ProviderError: {ProviderError}.",
                (int)httpResponse.StatusCode,
                safeProviderError
            );

            throw new HttpRequestException(
                "Mercado Pago rejected the payment request.",
                inner: null,
                statusCode:
                    httpResponse.StatusCode
            );
        }

        var mercadoPagoResponse =
            await httpResponse.Content
                .ReadFromJsonAsync<
                    MercadoPagoCreateOrderResponse>(
                    cancellationToken:
                        cancellationToken
                );

        if (mercadoPagoResponse is null)
        {
            throw new InvalidOperationException(
                "Mercado Pago returned an empty response."
            );
        }

        if (string.IsNullOrWhiteSpace(
                mercadoPagoResponse.Id))
        {
            throw new InvalidOperationException(
                "Mercado Pago returned an order without an id."
            );
        }

        var payment =
            mercadoPagoResponse
                .Transactions
                .Payments
                .FirstOrDefault();

        var paymentStatus =
            !string.IsNullOrWhiteSpace(
                payment?.Status)
                ? payment.Status
                : mercadoPagoResponse.Status;

        var paymentStatusDetail =
            !string.IsNullOrWhiteSpace(
                payment?.StatusDetail)
                ? payment.StatusDetail
                : mercadoPagoResponse.StatusDetail;

        var status =
            MercadoPagoStatusMapper.Map(
                paymentStatus,
                paymentStatusDetail
            );

        return new PaymentGatewayResult
        {
            ExternalOrderId =
                mercadoPagoResponse.Id.Trim(),

            ExternalPaymentId =
                payment?.Id?.Trim()
                ?? string.Empty,

            Status = status,

            StatusDetail =
                paymentStatusDetail?.Trim(),

            PixTicketUrl =
                payment?
                    .PaymentMethod?
                    .TicketUrl?
                    .Trim(),

            PixQrCode =
                payment?
                    .PaymentMethod?
                    .QrCode?
                    .Trim(),

            PixQrCodeBase64 =
                payment?
                    .PaymentMethod?
                    .QrCodeBase64?
                    .Trim()
        };
    }

    private static string ExtractSafeProviderError(
        string? errorBody)
    {
        if (string.IsNullOrWhiteSpace(
                errorBody))
        {
            return "Empty response body";
        }

        try
        {
            using var document =
                JsonDocument.Parse(
                    errorBody
                );

            var details =
                new List<string>();

            CollectSafeErrorDetails(
                document.RootElement,
                details
            );

            if (details.Count == 0)
            {
                return
                    "Unrecognized provider error payload";
            }

            var distinctDetails =
                details
                    .Where(detail =>
                        !string.IsNullOrWhiteSpace(
                            detail
                        ))
                    .Distinct(
                        StringComparer.OrdinalIgnoreCase
                    );

            var result =
                string.Join(
                    " | ",
                    distinctDetails
                );

            return result.Length <= 1500
                ? result
                : result[..1500];
        }
        catch (JsonException)
        {
            return
                "Non-JSON provider error payload";
        }
    }

    private static void CollectSafeErrorDetails(
        JsonElement element,
        ICollection<string> details,
        int depth = 0)
    {
        if (depth > 5)
        {
            return;
        }

        switch (element.ValueKind)
        {
            case JsonValueKind.String:
                AddSafeDetailText(
                    element.GetString(),
                    "detail",
                    details
                );

                return;

            case JsonValueKind.Number:
                AddSafeDetailText(
                    element.ToString(),
                    "detail",
                    details
                );

                return;

            case JsonValueKind.Array:
                foreach (var item in
                         element.EnumerateArray())
                {
                    CollectSafeErrorDetails(
                        item,
                        details,
                        depth + 1
                    );
                }

                return;

            case JsonValueKind.Object:
                break;

            default:
                return;
        }

        AddPropertyIfSafe(
            element,
            "code",
            details
        );

        AddPropertyIfSafe(
            element,
            "message",
            details
        );

        AddPropertyIfSafe(
            element,
            "error",
            details
        );

        AddPropertyIfSafe(
            element,
            "description",
            details
        );

        AddPropertyIfSafe(
            element,
            "detail",
            details
        );

        AddPropertyIfSafe(
            element,
            "field",
            details
        );

        AddPropertyIfSafe(
            element,
            "path",
            details
        );

        AddPropertyIfSafe(
            element,
            "status",
            details
        );

        AddPropertyIfSafe(
            element,
            "status_detail",
            details
        );

        AddPropertyIfSafe(
            element,
            "type",
            details
        );

        CollectNestedSafeProperty(
            element,
            "errors",
            details,
            depth
        );

        CollectNestedSafeProperty(
            element,
            "details",
            details,
            depth
        );

        CollectNestedSafeProperty(
            element,
            "cause",
            details,
            depth
        );

        CollectNestedSafeProperty(
            element,
            "causes",
            details,
            depth
        );
    }

    private static void CollectNestedSafeProperty(
        JsonElement element,
        string propertyName,
        ICollection<string> details,
        int depth)
    {
        if (!element.TryGetProperty(
                propertyName,
                out var nested))
        {
            return;
        }

        CollectSafeErrorDetails(
            nested,
            details,
            depth + 1
        );
    }

    private static void AddPropertyIfSafe(
        JsonElement element,
        string propertyName,
        ICollection<string> details)
    {
        if (!element.TryGetProperty(
                propertyName,
                out var property))
        {
            return;
        }

        if (property.ValueKind is not (
            JsonValueKind.String or
            JsonValueKind.Number))
        {
            return;
        }

        AddSafeDetailText(
            property.ToString(),
            propertyName,
            details
        );
    }

    private static void AddSafeDetailText(
        string? value,
        string label,
        ICollection<string> details)
    {
        if (string.IsNullOrWhiteSpace(
                value))
        {
            return;
        }

        var normalizedValue =
            value.Trim();

        if (normalizedValue.Length > 500)
        {
            normalizedValue =
                normalizedValue[..500];
        }

        details.Add(
            $"{label}: {normalizedValue}"
        );
    }
}