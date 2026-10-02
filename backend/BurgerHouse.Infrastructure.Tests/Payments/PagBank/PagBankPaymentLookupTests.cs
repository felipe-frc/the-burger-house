using System.Net;
using System.Text.Json;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Tests.Payments.PagBank;

public class PagBankPaymentLookupTests
{
    [Theory]
    [InlineData("PAID", 0, "PIX", null, PaymentGatewayStatus.Approved, PaymentMethod.Pix)]
    [InlineData("AUTHORIZED", 0, "CREDIT_CARD", null, PaymentGatewayStatus.Pending, PaymentMethod.CreditCard)]
    [InlineData("WAITING", 0, "BOLETO", null, PaymentGatewayStatus.Pending, PaymentMethod.Unknown)]
    [InlineData("DECLINED", 0, "DEBIT_CARD", null, PaymentGatewayStatus.Rejected, PaymentMethod.DebitCard)]
    [InlineData("CANCELED", 0, "PIX", null, PaymentGatewayStatus.Cancelled, PaymentMethod.Pix)]
    [InlineData("PAID", 4390, "PIX", null, PaymentGatewayStatus.Refunded, PaymentMethod.Pix)]
    [InlineData("PAID", 1000, "CREDIT_CARD", "PRE_PAID", PaymentGatewayStatus.PartiallyRefunded, PaymentMethod.PrepaidCard)]
    public async Task MapsOfficialCharge(
        string status,
        int refunded,
        string method,
        string? product,
        PaymentGatewayStatus expectedStatus,
        PaymentMethod expectedMethod)
    {
        HttpRequestMessage? captured = null;
        var payload = JsonSerializer.Serialize(new
        {
            id = "CHAR_1",
            reference_id = "payment:17",
            status,
            amount = new
            {
                value = 4390,
                currency = "BRL",
                summary = new { total = 4390, refunded }
            },
            payment_method = new { type = method, card = new { product } }
        });
        using var http = new HttpClient(new Stub(request =>
        {
            captured = request;
            return Task.FromResult(Json(HttpStatusCode.OK, payload));
        }));

        var snapshot = await Lookup(http).GetAsync("CHAR_1");

        Assert.NotNull(snapshot);
        Assert.Equal(expectedStatus, snapshot.PaymentStatus);
        Assert.Equal(expectedMethod, snapshot.PaymentMethod);
        Assert.Equal(43.90m, snapshot.Amount);
        Assert.Equal("BRL", snapshot.Currency);
        Assert.Equal("payment:17", snapshot.ReferenceId);
        Assert.Equal(HttpMethod.Get, captured!.Method);
        Assert.Equal("https://sandbox.api.pagseguro.com/charges/CHAR_1", captured.RequestUri!.ToString());
        Assert.Equal("Bearer", captured.Headers.Authorization!.Scheme);
        Assert.Equal("local-test-token", captured.Headers.Authorization.Parameter);
        Assert.Equal("*/*", Assert.Single(captured.Headers.Accept).ToString());
    }

    [Fact]
    public async Task ReturnsNullForNotFound()
    {
        using var http = new HttpClient(new Stub(_ => Task.FromResult(Json(HttpStatusCode.NotFound, "{}"))));
        Assert.Null(await Lookup(http).GetAsync("CHAR_missing"));
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.NotAcceptable)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task RejectsProviderErrors(HttpStatusCode status)
    {
        using var http = new HttpClient(new Stub(_ => Task.FromResult(Json(status, "{}"))));
        var exception = await Assert.ThrowsAsync<HttpRequestException>(() => Lookup(http).GetAsync("CHAR_1"));
        Assert.Equal(status, exception.StatusCode);
    }

    [Theory]
    [InlineData("not-json")]
    [InlineData("{}")]
    [InlineData("{\"id\":\"CHAR_1\",\"reference_id\":\"payment:17\",\"status\":\"UNKNOWN\",\"amount\":{\"value\":4390,\"currency\":\"BRL\",\"summary\":{\"total\":4390,\"refunded\":0}},\"payment_method\":{\"type\":\"PIX\"}}")]
    public async Task RejectsInvalidIncompleteOrUnknownResponses(string payload)
    {
        using var http = new HttpClient(new Stub(_ => Task.FromResult(Json(HttpStatusCode.OK, payload))));
        await Assert.ThrowsAnyAsync<Exception>(() => Lookup(http).GetAsync("CHAR_1"));
    }

    [Fact]
    public async Task PropagatesTimeout()
    {
        using var http = new HttpClient(new Stub(_ => throw new TaskCanceledException("timeout")));
        await Assert.ThrowsAsync<TaskCanceledException>(() => Lookup(http).GetAsync("CHAR_1"));
    }

    private static PagBankPaymentLookup Lookup(HttpClient http) =>
        new(http, Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com",
            Token = "local-test-token"
        }));

    private static HttpResponseMessage Json(HttpStatusCode status, string value) =>
        new(status) { Content = new StringContent(value, System.Text.Encoding.UTF8, "application/json") };

    private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request);
    }
}
