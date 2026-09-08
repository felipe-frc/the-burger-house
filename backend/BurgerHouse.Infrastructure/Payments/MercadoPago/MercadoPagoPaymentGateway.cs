using System.Net.Http.Json;
using System.Text.Json;
using BurgerHouse.Application.Abstractions.Payments;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoPaymentGateway : IPaymentGateway
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<MercadoPagoPaymentGateway>? _logger;

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

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
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
            MercadoPagoRequestFactory.Create(request);

        using var httpRequest = new HttpRequestMessage(
            HttpMethod.Post,
            "v1/orders"
        );

        httpRequest.Headers.Add(
            "X-Idempotency-Key",
            parsedIdempotencyKey.ToString("D")
        );

        httpRequest.Content =
            JsonContent.Create(mercadoPagoRequest);

        using var httpResponse =
            await _httpClient.SendAsync(
                httpRequest,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken
            );

        if (!httpResponse.IsSuccessStatusCode)
        {
            var errorBody =
                await httpResponse.Content.ReadAsStringAsync(
                    cancellationToken
                );

            var safeProviderError =
                ExtractSafeProviderError(errorBody);

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
                statusCode: httpResponse.StatusCode
            );
        }

        var mercadoPagoResponse =
            await httpResponse.Content
                .ReadFromJsonAsync<MercadoPagoCreateOrderResponse>(
                    cancellationToken: cancellationToken
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

        var payment = mercadoPagoResponse
            .Transactions
            .Payments
            .FirstOrDefault();

        var paymentStatus =
            !string.IsNullOrWhiteSpace(payment?.Status)
                ? payment.Status
                : mercadoPagoResponse.Status;

        var paymentStatusDetail =
            !string.IsNullOrWhiteSpace(payment?.StatusDetail)
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
                payment?.Id?.Trim() ?? string.Empty,

            Status = status,

            StatusDetail =
                paymentStatusDetail?.Trim()
        };
    }

    private static string ExtractSafeProviderError(
        string? errorBody)
    {
        if (string.IsNullOrWhiteSpace(errorBody))
        {
            return "Empty response body";
        }

        try
        {
            using var document =
                JsonDocument.Parse(errorBody);

            var root = document.RootElement;
            var details = new List<string>();

            AddPropertyIfSafe(
                root,
                "message",
                details
            );

            AddPropertyIfSafe(
                root,
                "error",
                details
            );

            AddPropertyIfSafe(
                root,
                "status",
                details
            );

            if (root.TryGetProperty(
                    "errors",
                    out var errorsElement) &&
                errorsElement.ValueKind ==
                JsonValueKind.Array)
            {
                foreach (var error in
                         errorsElement.EnumerateArray())
                {
                    AddPropertyIfSafe(
                        error,
                        "code",
                        details
                    );

                    AddPropertyIfSafe(
                        error,
                        "message",
                        details
                    );

                    if (error.TryGetProperty(
                            "details",
                            out var errorDetails) &&
                        errorDetails.ValueKind ==
                        JsonValueKind.Array)
                    {
                        foreach (var detail in
                                 errorDetails.EnumerateArray())
                        {
                            if (detail.ValueKind ==
                                JsonValueKind.String)
                            {
                                var value =
                                    detail.GetString();

                                if (!string.IsNullOrWhiteSpace(
                                        value))
                                {
                                    details.Add(
                                        $"detail: {value}"
                                    );
                                }
                            }
                        }
                    }
                }
            }

            if (root.TryGetProperty(
                    "cause",
                    out var causeElement) &&
                causeElement.ValueKind ==
                JsonValueKind.Array)
            {
                foreach (var cause in
                         causeElement.EnumerateArray())
                {
                    AddPropertyIfSafe(
                        cause,
                        "code",
                        details
                    );

                    AddPropertyIfSafe(
                        cause,
                        "description",
                        details
                    );
                }
            }

            if (details.Count == 0)
            {
                return "Unrecognized provider error payload";
            }

            var result =
                string.Join(" | ", details);

            return result.Length <= 1000
                ? result
                : result[..1000];
        }
        catch (JsonException)
        {
            return "Non-JSON provider error payload";
        }
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

        var value = property.ToString();

        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        details.Add(
            $"{propertyName}: {value}"
        );
    }
}