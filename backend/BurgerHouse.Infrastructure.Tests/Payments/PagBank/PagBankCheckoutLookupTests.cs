using System.Net;
using System.Text.Json;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Tests.Payments.PagBank;

public class PagBankCheckoutLookupTests
{
    [Fact]
    public async Task MapsCheckoutAndAssociatedCharges()
    {
        HttpRequestMessage? captured = null;
        using var http = new HttpClient(new Stub(request =>
        {
            captured = request;
            return Task.FromResult(Json(HttpStatusCode.OK, JsonSerializer.Serialize(new
            {
                id = "CHEC_1",
                reference_id = "payment:17",
                charges = new[]
                {
                    new
                    {
                        id = "CHAR_1",
                        reference_id = "payment:17",
                        status = "PAID",
                        amount = new
                        {
                            value = 4390,
                            currency = "BRL",
                            summary = new { total = 4390, refunded = 0 }
                        },
                        payment_method = new { type = "CREDIT_CARD", card = new { product = "CREDIT" } }
                    }
                }
            })));
        }));

        var snapshot = await Lookup(http).GetAsync("CHEC_1");

        Assert.NotNull(snapshot);
        Assert.Equal("CHEC_1", snapshot.Id);
        Assert.Equal("payment:17", snapshot.ReferenceId);
        var charge = Assert.Single(snapshot.Charges);
        Assert.Equal("CHAR_1", charge.Id);
        Assert.Equal(PaymentGatewayStatus.Approved, charge.PaymentStatus);
        Assert.Equal(PaymentMethod.CreditCard, charge.PaymentMethod);
        Assert.Equal(43.90m, charge.Amount);
        Assert.Equal(HttpMethod.Get, captured!.Method);
        Assert.EndsWith("/checkouts/CHEC_1?limit=100", captured.RequestUri!.ToString(), StringComparison.Ordinal);
        Assert.Equal("Bearer", captured.Headers.Authorization!.Scheme);
        Assert.Equal("local-test-token", captured.Headers.Authorization.Parameter);
    }

    [Fact]
    public async Task ReturnsNullForNotFound()
    {
        using var http = new HttpClient(new Stub(_ =>
            Task.FromResult(Json(HttpStatusCode.NotFound, "{}"))));

        Assert.Null(await Lookup(http).GetAsync("CHEC_missing"));
    }

    [Theory]
    [InlineData("not-json")]
    [InlineData("{}")]
    [InlineData("{\"id\":\"CHEC_1\",\"reference_id\":\"payment:17\",\"charges\":[{}]}")]
    [InlineData("{\"id\":\"CHEC_1\",\"reference_id\":\"payment:17\",\"charges\":[{\"id\":\"CHAR_1\",\"reference_id\":\"payment:17\",\"status\":\"UNKNOWN\",\"amount\":{\"value\":4390,\"currency\":\"BRL\",\"summary\":{\"total\":4390,\"refunded\":0}},\"payment_method\":{\"type\":\"PIX\"}}]}")]
    public async Task RejectsInvalidIncompleteOrUnknownResponses(string payload)
    {
        using var http = new HttpClient(new Stub(_ =>
            Task.FromResult(Json(HttpStatusCode.OK, payload))));

        await Assert.ThrowsAnyAsync<Exception>(() => Lookup(http).GetAsync("CHEC_1"));
    }

    private static PagBankCheckoutLookup Lookup(HttpClient http) =>
        new(http, Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com",
            Token = "local-test-token"
        }));

    private static HttpResponseMessage Json(HttpStatusCode status, string value) =>
        new(status) { Content = new StringContent(value, System.Text.Encoding.UTF8, "application/json") };

    private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            send(request);
    }
}
