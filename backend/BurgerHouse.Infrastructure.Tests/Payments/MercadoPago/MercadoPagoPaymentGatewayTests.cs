using System.Net;
using System.Text;
using System.Text.Json;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using Xunit;

namespace BurgerHouse.Infrastructure.Tests.Payments.MercadoPago;

public class MercadoPagoPaymentGatewayTests
{
    [Fact]
    public async Task ProcessAsync_ShouldSendCorrectRequestAndMapResponse()
    {
        HttpMethod? capturedMethod = null;
        string? capturedUri = null;
        string? capturedIdempotencyKey = null;
        string? capturedBody = null;

        var handler = new StubHttpMessageHandler(
            async (request, cancellationToken) =>
            {
                capturedMethod = request.Method;
                capturedUri = request.RequestUri?.ToString();

                capturedIdempotencyKey = request.Headers
                    .GetValues("X-Idempotency-Key")
                    .Single();

                capturedBody = await request.Content!
                    .ReadAsStringAsync(cancellationToken);

                return new HttpResponseMessage(
                    HttpStatusCode.Created
                )
                {
                    Content = new StringContent(
                        """
                        {
                          "id": "mp-order-123",
                          "status": "processed",
                          "status_detail": "accredited",
                          "transactions": {
                            "payments": [
                              {
                                "id": "mp-payment-456",
                                "status": "processed",
                                "status_detail": "accredited"
                              }
                            ]
                          }
                        }
                        """,
                        Encoding.UTF8,
                        "application/json"
                    )
                };
            }
        );

        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri(
                "https://api.mercadopago.com/"
            )
        };

        var gateway = new MercadoPagoPaymentGateway(
            httpClient
        );

        var request = CreateValidRequest();

        var result = await gateway.ProcessAsync(
            request
        );

        Assert.Equal(
            HttpMethod.Post,
            capturedMethod
        );

        Assert.Equal(
            "https://api.mercadopago.com/v1/orders",
            capturedUri
        );

        Assert.Equal(
            request.IdempotencyKey,
            capturedIdempotencyKey
        );

        Assert.NotNull(capturedBody);

        using var document = JsonDocument.Parse(
            capturedBody
        );

        var root = document.RootElement;

        Assert.Equal(
            "online",
            root.GetProperty("type").GetString()
        );

        Assert.Equal(
            "automatic",
            root.GetProperty("processing_mode").GetString()
        );

        Assert.Equal(
            "87.80",
            root.GetProperty("total_amount").GetString()
        );

        Assert.Equal(
            "15",
            root.GetProperty("external_reference").GetString()
        );

        Assert.Equal(
            "cliente@email.com",
            root
                .GetProperty("payer")
                .GetProperty("email")
                .GetString()
        );

        var payment = root
            .GetProperty("transactions")
            .GetProperty("payments")[0];

        Assert.Equal(
            "87.80",
            payment.GetProperty("amount").GetString()
        );

        var paymentMethod = payment
            .GetProperty("payment_method");

        Assert.Equal(
            "master",
            paymentMethod.GetProperty("id").GetString()
        );

        Assert.Equal(
            "temporary-payment-token",
            paymentMethod.GetProperty("token").GetString()
        );

        Assert.Equal(
            2,
            paymentMethod
                .GetProperty("installments")
                .GetInt32()
        );

        Assert.Equal(
            "mp-order-123",
            result.ExternalOrderId
        );

        Assert.Equal(
            "mp-payment-456",
            result.ExternalPaymentId
        );

        Assert.Equal(
            PaymentGatewayStatus.Approved,
            result.Status
        );

        Assert.Equal(
            "accredited",
            result.StatusDetail
        );
    }

    [Fact]
    public async Task ProcessAsync_ShouldRejectInvalidIdempotencyKeyBeforeHttpCall()
    {
        var httpWasCalled = false;

        var handler = new StubHttpMessageHandler(
            (request, cancellationToken) =>
            {
                httpWasCalled = true;

                return Task.FromResult(
                    new HttpResponseMessage(
                        HttpStatusCode.OK
                    )
                );
            }
        );

        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri(
                "https://api.mercadopago.com/"
            )
        };

        var gateway = new MercadoPagoPaymentGateway(
            httpClient
        );

        var request = CreateValidRequest(
            idempotencyKey: "invalid-key"
        );

        await Assert.ThrowsAsync<ArgumentException>(
            () => gateway.ProcessAsync(request)
        );

        Assert.False(httpWasCalled);
    }

    [Fact]
    public async Task ProcessAsync_ShouldThrowSafeException_WhenProviderReturnsError()
    {
        var handler = new StubHttpMessageHandler(
            (request, cancellationToken) =>
            {
                return Task.FromResult(
                    new HttpResponseMessage(
                        HttpStatusCode.TooManyRequests
                    )
                    {
                        Content = new StringContent(
                            "sensitive provider response"
                        )
                    }
                );
            }
        );

        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri(
                "https://api.mercadopago.com/"
            )
        };

        var gateway = new MercadoPagoPaymentGateway(
            httpClient
        );

        var exception =
            await Assert.ThrowsAsync<HttpRequestException>(
                () => gateway.ProcessAsync(
                    CreateValidRequest()
                )
            );

        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            exception.StatusCode
        );

        Assert.Equal(
            "Mercado Pago rejected the payment request.",
            exception.Message
        );

        Assert.DoesNotContain(
            "sensitive provider response",
            exception.Message
        );
    }

    [Fact]
    public async Task ProcessAsync_ShouldRejectSuccessfulResponseWithoutOrderId()
    {
        var handler = new StubHttpMessageHandler(
            (request, cancellationToken) =>
            {
                return Task.FromResult(
                    new HttpResponseMessage(
                        HttpStatusCode.Created
                    )
                    {
                        Content = new StringContent(
                            """
                            {
                              "id": "",
                              "status": "processed",
                              "status_detail": "accredited",
                              "transactions": {
                                "payments": []
                              }
                            }
                            """,
                            Encoding.UTF8,
                            "application/json"
                        )
                    }
                );
            }
        );

        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri(
                "https://api.mercadopago.com/"
            )
        };

        var gateway = new MercadoPagoPaymentGateway(
            httpClient
        );

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => gateway.ProcessAsync(
                CreateValidRequest()
            )
        );
    }

    private static PaymentGatewayRequest CreateValidRequest(
        string idempotencyKey =
            "00000000-0000-0000-0000-000000000001")
    {
        return new PaymentGatewayRequest
        {
            OrderId = 15,
            Amount = 87.80m,
            IdempotencyKey = idempotencyKey,
            PaymentToken = "temporary-payment-token",
            PaymentMethodId = "master",
            Installments = 2,
            PayerEmail = "cliente@email.com"
        };
    }

    private sealed class StubHttpMessageHandler
        : HttpMessageHandler
    {
        private readonly Func<
            HttpRequestMessage,
            CancellationToken,
            Task<HttpResponseMessage>> _handler;

        public StubHttpMessageHandler(
            Func<
                HttpRequestMessage,
                CancellationToken,
                Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            return _handler(
                request,
                cancellationToken
            );
        }
    }
}