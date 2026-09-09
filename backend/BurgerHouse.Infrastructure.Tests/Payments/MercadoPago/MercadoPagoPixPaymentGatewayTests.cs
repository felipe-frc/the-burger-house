using System.Net;
using System.Text;
using System.Text.Json;

using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.MercadoPago;

namespace BurgerHouse.Infrastructure.Tests.Payments.MercadoPago;

public class MercadoPagoPixPaymentGatewayTests
{
    [Fact]
    public async Task ProcessAsync_ShouldCreatePixRequestAndReturnQrCode()
    {
        string? capturedBody = null;

        var handler =
            new StubHttpMessageHandler(
                async (
                    request,
                    cancellationToken) =>
                {
                    capturedBody =
                        await request.Content!
                            .ReadAsStringAsync(
                                cancellationToken
                            );

                    return new HttpResponseMessage(
                        HttpStatusCode.Created
                    )
                    {
                        Content =
                            new StringContent(
                                """
                                {
                                  "id": "mp-order-pix-123",
                                  "status": "action_required",
                                  "status_detail": "waiting_transfer",
                                  "transactions": {
                                    "payments": [
                                      {
                                        "id": "mp-payment-pix-456",
                                        "status": "action_required",
                                        "status_detail": "waiting_transfer",
                                        "payment_method": {
                                          "id": "pix",
                                          "type": "bank_transfer",
                                          "ticket_url": "https://mercadopago.com/pix",
                                          "qr_code": "000201PIXCODE",
                                          "qr_code_base64": "BASE64QR"
                                        }
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

        using var httpClient =
            new HttpClient(
                handler
            )
            {
                BaseAddress =
                    new Uri(
                        "https://api.mercadopago.com/"
                    )
            };

        var gateway =
            new MercadoPagoPaymentGateway(
                httpClient
            );

        var result =
            await gateway.ProcessAsync(
                new PaymentGatewayRequest
                {
                    OrderId = 15,

                    Amount = 87.80m,

                    IdempotencyKey =
                        "00000000-0000-4000-8000-000000000001",

                    Method =
                        PaymentMethod.Pix,

                    PayerEmail =
                        "cliente@email.com"
                }
            );

        Assert.NotNull(
            capturedBody
        );

        using var document =
            JsonDocument.Parse(
                capturedBody
            );

        var paymentMethod =
            document
                .RootElement
                .GetProperty(
                    "transactions"
                )
                .GetProperty(
                    "payments"
                )[0]
                .GetProperty(
                    "payment_method"
                );

        Assert.Equal(
            "pix",
            paymentMethod
                .GetProperty("id")
                .GetString()
        );

        Assert.Equal(
            "bank_transfer",
            paymentMethod
                .GetProperty("type")
                .GetString()
        );

        Assert.False(
            paymentMethod.TryGetProperty(
                "token",
                out _
            )
        );

        Assert.False(
            paymentMethod.TryGetProperty(
                "installments",
                out _
            )
        );

        Assert.Equal(
            PaymentGatewayStatus.Pending,
            result.Status
        );

        Assert.Equal(
            "waiting_transfer",
            result.StatusDetail
        );

        Assert.Equal(
            "mp-order-pix-123",
            result.ExternalOrderId
        );

        Assert.Equal(
            "mp-payment-pix-456",
            result.ExternalPaymentId
        );

        Assert.Equal(
            "https://mercadopago.com/pix",
            result.PixTicketUrl
        );

        Assert.Equal(
            "000201PIXCODE",
            result.PixQrCode
        );

        Assert.Equal(
            "BASE64QR",
            result.PixQrCodeBase64
        );
    }

    private sealed class StubHttpMessageHandler
        : HttpMessageHandler
    {
        private readonly Func<
            HttpRequestMessage,
            CancellationToken,
            Task<HttpResponseMessage>>
            _handler;

        public StubHttpMessageHandler(
            Func<
                HttpRequestMessage,
                CancellationToken,
                Task<HttpResponseMessage>>
                handler)
        {
            _handler =
                handler;
        }

        protected override
            Task<HttpResponseMessage>
            SendAsync(
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