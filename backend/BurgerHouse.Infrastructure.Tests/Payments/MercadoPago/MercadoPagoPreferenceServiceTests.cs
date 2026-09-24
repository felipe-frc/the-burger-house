using System.Net;
using System.Text.Json;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Tests.Payments.MercadoPago;

public class MercadoPagoPreferenceServiceTests
{
    [Fact]
    public async Task CreatesWithPaymentReferenceAndReusesById()
    {
        var handler = new Stub();

        using var http = new HttpClient(handler);

        var service = new MercadoPagoPreferenceService(
            http,
            Options.Create(
                new MercadoPagoOptions
                {
                    AccessToken = "local-test-token",
                    ReturnUrl = "https://example.com/?checkout=return",
                    NotificationUrl =
                        "https://api.example.com/api/webhooks/mercadopago"
                }
            )
        );

        var payment = new Payment(
            99,
            43.90m,
            Guid.NewGuid().ToString("D"),
            PaymentMethod.Unknown
        );

        typeof(Payment)
            .GetProperty(nameof(Payment.Id))!
            .SetValue(payment, 17);

        await service.GetOrCreateAsync(payment);

        Assert.Equal(
            "pref-17",
            payment.ExternalPreferenceId
        );

        await service.GetOrCreateAsync(payment);

        Assert.Equal(
            new[] { "POST", "GET" },
            handler.Methods
        );

        using var json =
            JsonDocument.Parse(handler.Body!);

        var root = json.RootElement;

        Assert.Equal(
            "17",
            root.GetProperty("external_reference")
                .GetString()
        );

        Assert.Equal(
            43.90m,
            root.GetProperty("items")[0]
                .GetProperty("unit_price")
                .GetDecimal()
        );

        Assert.Equal(
            "BRL",
            root.GetProperty("items")[0]
                .GetProperty("currency_id")
                .GetString()
        );

        Assert.Equal(
            "approved",
            root.GetProperty("auto_return")
                .GetString()
        );

        Assert.False(
            root.GetProperty("binary_mode")
                .GetBoolean()
        );

        Assert.False(
            root.TryGetProperty(
                "notification_url",
                out _
            )
        );

        var paymentMethods =
            root.GetProperty("payment_methods");

        var excludedTypes =
            paymentMethods
                .GetProperty("excluded_payment_types")
                .EnumerateArray()
                .Select(
                    item =>
                        item.GetProperty("id")
                            .GetString()
                )
                .ToArray();

        Assert.Contains(
            "ticket",
            excludedTypes
        );

        Assert.DoesNotContain(
            "bank_transfer",
            excludedTypes
        );

        Assert.DoesNotContain(
            "pix",
            excludedTypes
        );

        if (paymentMethods.TryGetProperty(
                "excluded_payment_methods",
                out var excludedMethods))
        {
            Assert.DoesNotContain(
                excludedMethods.EnumerateArray(),
                item =>
                    item.GetProperty("id")
                        .GetString() == "pix"
            );
        }
    }

    [Fact]
    public async Task RefusesUnpersistedPaymentWithoutHttp()
    {
        var handler = new Stub();

        using var http =
            new HttpClient(handler);

        var service =
            new MercadoPagoPreferenceService(
                http,
                Options.Create(
                    new MercadoPagoOptions
                    {
                        AccessToken =
                            "local-test-token"
                    }
                )
            );

        await Assert.ThrowsAsync<InvalidOperationException>(
            () =>
                service.GetOrCreateAsync(
                    new Payment(
                        1,
                        1m,
                        Guid.NewGuid().ToString("D"),
                        PaymentMethod.Unknown
                    )
                )
        );

        Assert.Empty(handler.Methods);
    }

    [Theory]
    [InlineData("https://localhost:5173/")]
    [InlineData("http://example.com/")]
    public void RejectsInvalidReturnUrl(string url)
    {
        using var http =
            new HttpClient(new Stub());

        Assert.Throws<InvalidOperationException>(
            () =>
                new MercadoPagoPreferenceService(
                    http,
                    Options.Create(
                        new MercadoPagoOptions
                        {
                            AccessToken = "test",
                            ReturnUrl = url
                        }
                    )
                )
        );
    }

    private sealed class Stub : HttpMessageHandler
    {
        public List<string> Methods { get; } = [];

        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage>
            SendAsync(
                HttpRequestMessage request,
                CancellationToken ct)
        {
            Methods.Add(
                request.Method.Method
            );

            if (request.Content is not null)
            {
                Body =
                    await request.Content
                        .ReadAsStringAsync(ct);
            }

            return new HttpResponseMessage(
                HttpStatusCode.OK
            )
            {
                Content = new StringContent(
                    """
                    {
                      "id": "pref-17",
                      "external_reference": "17",
                      "init_point": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-17",
                      "expires": false
                    }
                    """
                )
            };
        }
    }
}