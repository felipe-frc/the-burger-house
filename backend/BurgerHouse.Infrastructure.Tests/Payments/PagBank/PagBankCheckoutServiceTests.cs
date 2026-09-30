using System.Net;
using System.Text.Json;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Tests.Payments.PagBank;

public class PagBankCheckoutServiceTests
{
    [Fact]
    public async Task CreatesCheckoutWithBearerReferenceCentsUrlsAndPayLinkByRelation()
    {
        HttpRequestMessage? captured = null;
        string? requestBody = null;
        using var http = new HttpClient(new Stub(async request =>
        {
            captured = request;
            requestBody = await request.Content!.ReadAsStringAsync();
            return Json(HttpStatusCode.OK, """
                {
                  "id":"CHEC_1",
                  "reference_id":"payment:17",
                  "status":"ACTIVE",
                  "links":[
                    {"rel":"SELF","href":"https://api.pagseguro.com/checkouts/CHEC_1"},
                    {"rel":"PAY","href":"https://pagamento.pagbank.com.br/checkout/CHEC_1"}
                  ]
                }
                """);
        }));
        var payment = NewPayment();

        var result = await Service(http).GetOrCreateAsync(payment);

        Assert.Equal(HttpMethod.Post, captured!.Method);
        Assert.Equal("https://sandbox.api.pagseguro.com/checkouts", captured.RequestUri!.ToString());
        Assert.Equal("Bearer", captured.Headers.Authorization!.Scheme);
        Assert.Equal("local-test-token", captured.Headers.Authorization.Parameter);
        using var body = JsonDocument.Parse(requestBody!);
        Assert.Equal("payment:17", body.RootElement.GetProperty("reference_id").GetString());
        var item = Assert.Single(body.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal("order:5", item.GetProperty("reference_id").GetString());
        Assert.Equal(1, item.GetProperty("quantity").GetInt32());
        Assert.Equal(4390, item.GetProperty("unit_amount").GetInt32());
        Assert.Equal("https://shop.example/return", body.RootElement.GetProperty("redirect_url").GetString());
        Assert.Equal("https://shop.example/return", body.RootElement.GetProperty("return_url").GetString());
        Assert.Equal("https://api.example/api/webhooks/pagbank", Assert.Single(body.RootElement.GetProperty("notification_urls").EnumerateArray()).GetString());
        Assert.Equal("https://api.example/api/webhooks/pagbank", Assert.Single(body.RootElement.GetProperty("payment_notification_urls").EnumerateArray()).GetString());
        Assert.Equal(17, result.PaymentId);
        Assert.Equal("CHEC_1", result.ExternalCheckoutId);
        Assert.Equal("https://pagamento.pagbank.com.br/checkout/CHEC_1", result.CheckoutUrl);
        Assert.Equal("CHEC_1", payment.ExternalCheckoutId);
    }

    [Fact]
    public async Task ExistingCheckoutIsReadInsteadOfCreated()
    {
        HttpRequestMessage? captured = null;
        using var http = new HttpClient(new Stub(request =>
        {
            captured = request;
            return Task.FromResult(Json(HttpStatusCode.OK, """
                {"id":"CHEC_1","reference_id":"payment:17","status":"ACTIVE","links":[{"rel":"PAY","href":"https://sandbox.pagseguro.uol.com.br/v2/checkout/payment.html?code=CHEC_1"}]}
                """));
        }));
        var payment = NewPayment();
        payment.SetExternalCheckoutId("CHEC_1");

        await Service(http).GetOrCreateAsync(payment);

        Assert.Equal(HttpMethod.Get, captured!.Method);
        Assert.EndsWith("/checkouts/CHEC_1", captured.RequestUri!.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("https://pagamento.pagbank.com.br/pagamento?code=teste", true)]
    [InlineData("https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste", true)]
    [InlineData("https://sandbox.pagseguro.uol.com.br/v2/checkout/payment.html?code=teste", true)]
    [InlineData("https://pagseguro.uol.com.br/v2/checkout/payment.html?code=teste", true)]
    [InlineData("https://pagamento.sandbox.pagbank.com.br.evil.example/pagamento?code=teste", false)]
    [InlineData("http://pagamento.sandbox.pagbank.com.br/pagamento?code=teste", false)]
    [InlineData("https://usuario:senha@pagamento.sandbox.pagbank.com.br/pagamento?code=teste", false)]
    public void AcceptsOnlyExactSecureCheckoutHosts(string url, bool expected)
    {
        Assert.Equal(expected, PagBankCheckoutService.IsCheckoutUrl(url));
    }

    [Fact]
    public async Task AcceptsRealisticCurrentSandboxPayLink()
    {
        using var http = new HttpClient(new Stub(_ => Task.FromResult(Json(HttpStatusCode.OK, """
            {
              "id":"CHEC_TESTE",
              "reference_id":"payment:17",
              "status":"ACTIVE",
              "links":[
                {
                  "rel":"SELF",
                  "href":"https://sandbox.api.pagseguro.com/checkouts/CHEC_TESTE",
                  "method":"GET"
                },
                {
                  "rel":"PAY",
                  "href":"https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste",
                  "method":"GET"
                }
              ]
            }
            """))));

        var result = await Service(http).GetOrCreateAsync(NewPayment());

        Assert.Equal("CHEC_TESTE", result.ExternalCheckoutId);
        Assert.Equal(
            "https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste",
            result.CheckoutUrl
        );
    }

    [Fact]
    public async Task RejectsResponseWithoutSingleValidPayLink()
    {
        using var http = new HttpClient(new Stub(_ => Task.FromResult(Json(HttpStatusCode.OK, """
            {"id":"CHEC_1","reference_id":"payment:17","status":"ACTIVE","links":[{"rel":"SELF","href":"https://api.pagseguro.com/checkouts/CHEC_1"}]}
            """))));

        await Assert.ThrowsAsync<InvalidOperationException>(() => Service(http).GetOrCreateAsync(NewPayment()));
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task ConvertsProviderErrorsToHttpRequestException(HttpStatusCode status)
    {
        using var http = new HttpClient(new Stub(_ => Task.FromResult(Json(status, "{}"))));

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            Service(http).GetOrCreateAsync(NewPayment()));

        Assert.Equal(status, exception.StatusCode);
    }

    [Fact]
    public async Task PropagatesTimeoutWithoutPersistingCheckout()
    {
        using var http = new HttpClient(new Stub(_ => throw new TaskCanceledException("timeout")));
        var payment = NewPayment();

        await Assert.ThrowsAsync<TaskCanceledException>(() => Service(http).GetOrCreateAsync(payment));

        Assert.Null(payment.ExternalCheckoutId);
    }

    [Fact]
    public async Task RejectsInvalidJson()
    {
        using var http = new HttpClient(new Stub(_ => Task.FromResult(Json(HttpStatusCode.OK, "not-json"))));

        await Assert.ThrowsAsync<JsonException>(() => Service(http).GetOrCreateAsync(NewPayment()));
    }

    private static PagBankCheckoutService Service(HttpClient http) =>
        new(http, Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com",
            Token = "local-test-token",
            RedirectUrl = "https://shop.example/return",
            NotificationUrl = "https://api.example/api/webhooks/pagbank"
        }));

    private static Payment NewPayment()
    {
        var payment = new Payment(5, 43.90m, Guid.NewGuid().ToString("D"), PaymentMethod.Unknown, PaymentProvider.PagBank);
        typeof(Payment).GetProperty(nameof(Payment.Id))!.SetValue(payment, 17);
        return payment;
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string value) =>
        new(status) { Content = new StringContent(value, System.Text.Encoding.UTF8, "application/json") };

    private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request);
    }
}
