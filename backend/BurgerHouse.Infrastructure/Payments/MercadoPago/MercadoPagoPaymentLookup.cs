using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

using BurgerHouse.Application.Abstractions.Payments;

using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoPaymentLookup
{
    private readonly HttpClient _httpClient;

    private readonly string _accessToken;

    public MercadoPagoPaymentLookup(
        HttpClient httpClient,
        IOptions<MercadoPagoOptions> options)
    {
        ArgumentNullException.ThrowIfNull(httpClient);

        ArgumentNullException.ThrowIfNull(options);

        if (string.IsNullOrWhiteSpace(
                options.Value.AccessToken))
        {
            throw new InvalidOperationException(
                "Mercado Pago access token was not configured."
            );
        }

        _httpClient = httpClient;

        _accessToken =
            options.Value.AccessToken;
    }

    public async Task<MercadoPagoPaymentSnapshot?> GetAsync(
        string externalPaymentId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(
                externalPaymentId))
        {
            throw new ArgumentException(
                "External payment id is required.",
                nameof(externalPaymentId)
            );
        }

        var normalizedPaymentId =
            externalPaymentId.Trim();

        using var request =
            new HttpRequestMessage(
                HttpMethod.Get,
                $"https://api.mercadopago.com/v1/payments/" +
                $"{Uri.EscapeDataString(normalizedPaymentId)}"
            );

        request.Headers.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                _accessToken
            );

        using var response =
            await _httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken
            );

        if (response.StatusCode ==
            HttpStatusCode.NotFound)
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"Mercado Pago payment lookup failed with HTTP " +
                $"{(int)response.StatusCode}.",
                inner: null,
                statusCode: response.StatusCode
            );
        }

        await using var stream =
            await response.Content.ReadAsStreamAsync(
                cancellationToken
            );

        using var document =
            await JsonDocument.ParseAsync(
                stream,
                cancellationToken:
                    cancellationToken
            );

        var root =
            document.RootElement;

        var id =
            GetValueAsString(
                root,
                "id"
            );

        var externalReference =
            GetValueAsString(
                root,
                "external_reference"
            );

        var providerStatus =
            GetValueAsString(
                root,
                "status"
            );

        var providerStatusDetail =
            GetValueAsString(
                root,
                "status_detail"
            );

        var paymentMethodId =
            GetValueAsString(
                root,
                "payment_method_id"
            );

        var paymentTypeId =
            GetValueAsString(
                root,
                "payment_type_id"
            );

        var currencyId =
            GetValueAsString(
                root,
                "currency_id"
            );

        var transactionAmount =
            GetDecimalValue(
                root,
                "transaction_amount"
            );

        if (string.IsNullOrWhiteSpace(id))
        {
            throw new InvalidOperationException(
                "Mercado Pago returned a payment without an id."
            );
        }

        if (string.IsNullOrWhiteSpace(
                externalReference))
        {
            throw new InvalidOperationException(
                "Mercado Pago returned a payment without an external reference."
            );
        }

        if (string.IsNullOrWhiteSpace(
                providerStatus))
        {
            throw new InvalidOperationException(
                "Mercado Pago returned a payment without a status."
            );
        }

        if (transactionAmount is null ||
            transactionAmount <= 0)
        {
            throw new InvalidOperationException(
                "Mercado Pago returned a payment without a valid transaction amount."
            );
        }

        var paymentStatus =
            MercadoPagoPaymentStatusMapper.Map(
                providerStatus,
                providerStatusDetail
            );

        return new MercadoPagoPaymentSnapshot(
            id.Trim(),
            externalReference.Trim(),
            paymentStatus,
            providerStatus.Trim(),
            providerStatusDetail?.Trim(),
            paymentMethodId?.Trim(),
            paymentTypeId?.Trim(),
            transactionAmount.Value,
            currencyId?.Trim()
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

    private static decimal? GetDecimalValue(
        JsonElement element,
        string propertyName)
    {
        if (!element.TryGetProperty(
                propertyName,
                out var property))
        {
            return null;
        }

        if (property.ValueKind ==
            JsonValueKind.Number)
        {
            if (property.TryGetDecimal(
                    out var numberValue))
            {
                return numberValue;
            }

            return null;
        }

        if (property.ValueKind ==
            JsonValueKind.String)
        {
            var stringValue =
                property.GetString();

            if (decimal.TryParse(
                    stringValue,
                    NumberStyles.AllowDecimalPoint,
                    CultureInfo.InvariantCulture,
                    out var parsedValue))
            {
                return parsedValue;
            }
        }

        return null;
    }
}

public sealed record MercadoPagoPaymentSnapshot(
    string Id,
    string ExternalReference,
    PaymentGatewayStatus PaymentStatus,
    string ProviderStatus,
    string? ProviderStatusDetail,
    string? PaymentMethodId,
    string? PaymentTypeId,
    decimal TransactionAmount,
    string? CurrencyId
);