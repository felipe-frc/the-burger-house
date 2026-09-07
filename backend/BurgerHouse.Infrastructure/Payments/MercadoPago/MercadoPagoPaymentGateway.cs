using System.Net.Http.Json;
using BurgerHouse.Application.Abstractions.Payments;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoPaymentGateway : IPaymentGateway
{
    private readonly HttpClient _httpClient;

    public MercadoPagoPaymentGateway(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<PaymentGatewayResult> ProcessAsync(
        PaymentGatewayRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            throw new ArgumentException(
                "Idempotency key cannot be empty."
            );

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

        httpRequest.Content = JsonContent.Create(
            mercadoPagoRequest
        );

        using var httpResponse = await _httpClient.SendAsync(
            httpRequest,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken
        );

        if (!httpResponse.IsSuccessStatusCode)
        {
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

        var status = MercadoPagoStatusMapper.Map(
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
}