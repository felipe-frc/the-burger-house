using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

using BurgerHouse.Application.Abstractions.Payments;

using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoOrderLookup
{
    private readonly HttpClient _httpClient;
    private readonly string _accessToken;

    public MercadoPagoOrderLookup(
        HttpClient httpClient,
        IOptions<MercadoPagoOptions> options)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);

        if (string.IsNullOrWhiteSpace(options.Value.AccessToken))
        {
            throw new InvalidOperationException(
                "Mercado Pago access token was not configured."
            );
        }

        _httpClient = httpClient;
        _accessToken = options.Value.AccessToken;
    }

    public async Task<MercadoPagoOrderSnapshot?> GetAsync(
        string externalOrderId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(externalOrderId))
        {
            throw new ArgumentException(
                "External order id is required.",
                nameof(externalOrderId)
            );
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://api.mercadopago.com/v1/orders/{Uri.EscapeDataString(externalOrderId)}"
        );

        request.Headers.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                _accessToken
            );

        using var response = await _httpClient.SendAsync(
            request,
            cancellationToken
        );

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"Mercado Pago order lookup failed with HTTP {(int)response.StatusCode}."
            );
        }

        await using var stream =
            await response.Content.ReadAsStreamAsync(
                cancellationToken
            );

        using var document =
            await JsonDocument.ParseAsync(
                stream,
                cancellationToken: cancellationToken
            );

        var root = document.RootElement;

        var id =
            GetValueAsString(
                root,
                "id"
            );

        var orderStatus =
            GetValueAsString(
                root,
                "status"
            );

        var orderStatusDetail =
            GetValueAsString(
                root,
                "status_detail"
            );

        string? externalPaymentId = null;
        string? paymentStatus = null;
        string? paymentStatusDetail = null;

        if (root.TryGetProperty(
                "transactions",
                out var transactionsElement) &&
            transactionsElement.ValueKind ==
                JsonValueKind.Object &&
            transactionsElement.TryGetProperty(
                "payments",
                out var paymentsElement) &&
            paymentsElement.ValueKind ==
                JsonValueKind.Array &&
            paymentsElement.GetArrayLength() > 0)
        {
            var paymentElement =
                paymentsElement[0];

            externalPaymentId =
                GetValueAsString(
                    paymentElement,
                    "id"
                );

            paymentStatus =
                GetValueAsString(
                    paymentElement,
                    "status"
                );

            paymentStatusDetail =
                GetValueAsString(
                    paymentElement,
                    "status_detail"
                );
        }

        if (string.IsNullOrWhiteSpace(id))
        {
            throw new InvalidOperationException(
                "Mercado Pago returned an order without an id."
            );
        }

        var effectiveStatus =
            !string.IsNullOrWhiteSpace(paymentStatus)
                ? paymentStatus
                : orderStatus;

        var effectiveStatusDetail =
            !string.IsNullOrWhiteSpace(paymentStatusDetail)
                ? paymentStatusDetail
                : orderStatusDetail;

        if (string.IsNullOrWhiteSpace(effectiveStatus))
        {
            throw new InvalidOperationException(
                "Mercado Pago returned an order without a payment status."
            );
        }

        var mappedStatus =
            MercadoPagoStatusMapper.Map(
                effectiveStatus,
                effectiveStatusDetail
            );

        return new MercadoPagoOrderSnapshot(
            id.Trim(),
            externalPaymentId?.Trim(),
            mappedStatus,
            effectiveStatus.Trim(),
            effectiveStatusDetail?.Trim()
        );
    }

    private static string? GetValueAsString(
        JsonElement element,
        string propertyName)
    {
        if (!element.TryGetProperty(
                propertyName,
                out var property))
        {
            return null;
        }

        return property.ValueKind switch
        {
            JsonValueKind.String =>
                property.GetString(),

            JsonValueKind.Number =>
                property.GetRawText(),

            _ => null
        };
    }
}

public sealed record MercadoPagoOrderSnapshot(
    string Id,
    string? ExternalPaymentId,
    PaymentGatewayStatus PaymentStatus,
    string ProviderStatus,
    string? ProviderStatusDetail
);