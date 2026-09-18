using System.Net;
using System.Text.Json;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Tests.Payments.MercadoPago;

public class MercadoPagoPaymentLookupTests
{
    [Theory]
    [InlineData("approved", null, PaymentGatewayStatus.Approved)]
    [InlineData("approved", "partially_refunded", PaymentGatewayStatus.PartiallyRefunded)]
    [InlineData("pending", null, PaymentGatewayStatus.Pending)]
    [InlineData("authorized", null, PaymentGatewayStatus.Pending)]
    [InlineData("in_process", null, PaymentGatewayStatus.Pending)]
    [InlineData("rejected", null, PaymentGatewayStatus.Rejected)]
    [InlineData("cancelled", null, PaymentGatewayStatus.Cancelled)]
    [InlineData("refunded", null, PaymentGatewayStatus.Refunded)]
    [InlineData("charged_back", null, PaymentGatewayStatus.ChargedBack)]
    public void MapsPaymentStates(string status, string? detail, PaymentGatewayStatus expected) =>
        Assert.Equal(expected, MercadoPagoPaymentStatusMapper.Map(status, detail));

    [Fact]
    public void RejectsUnknownStatus() => Assert.Throws<InvalidOperationException>(() => MercadoPagoPaymentStatusMapper.Map("processed", null));

    [Theory]
    [InlineData("bank_transfer", "pix", PaymentMethod.Pix)]
    [InlineData("credit_card", "visa", PaymentMethod.CreditCard)]
    [InlineData("debit_card", "debelo", PaymentMethod.DebitCard)]
    [InlineData("prepaid_card", "master", PaymentMethod.PrepaidCard)]
    [InlineData("account_money", "account_money", PaymentMethod.AccountMoney)]
    public void MapsActualMethod(string type, string method, PaymentMethod expected) =>
        Assert.Equal(expected, MercadoPagoPaymentMethodMapper.Map(type, method));

    [Theory]
    [InlineData("ticket", "bolbradesco")]
    [InlineData("bank_transfer", "other")]
    [InlineData("credit_card", "pix")]
    [InlineData("debit_card", "account_money")]
    [InlineData(null, "pix")]
    [InlineData("bank_transfer", null)]
    [InlineData("", "pix")]
    [InlineData("bank_transfer", "")]
    [InlineData(null, null)]
    public void RejectsUnsupportedMethod(string? type, string? method) =>
        Assert.Throws<InvalidOperationException>(() => MercadoPagoPaymentMethodMapper.Map(type, method));

    [Fact]
    public async Task ParsesVerifiedFields()
    {
        var result = await Lookup("""{"id":123,"external_reference":"17","status":"approved","status_detail":"accredited","transaction_amount":43.90,"currency_id":"BRL","payment_type_id":"bank_transfer","payment_method_id":"pix"}""");
        Assert.NotNull(result);
        Assert.Equal("123", result.Id);
        Assert.Equal("17", result.ExternalReference);
        Assert.Equal(PaymentGatewayStatus.Approved, result.PaymentStatus);
        Assert.Equal("approved", result.ProviderStatus);
        Assert.Equal(43.90m, result.TransactionAmount);
        Assert.Equal("BRL", result.CurrencyId);
        Assert.Equal("pix", result.PaymentMethodId);
        Assert.Equal("bank_transfer", result.PaymentTypeId);
        Assert.Equal("accredited", result.ProviderStatusDetail);
    }

    [Theory]
    [InlineData("external_reference", null)]
    [InlineData("status", null)]
    [InlineData("id", null)]
    [InlineData("transaction_amount", "43,90")]
    [InlineData("transaction_amount", "4,390")]
    [InlineData("transaction_amount", "0")]
    [InlineData("transaction_amount", "-1")]
    [InlineData("transaction_amount", null)]
    public async Task RejectsIncompleteOrAmbiguousResponse(string field, string? value)
    {
        var payload = new Dictionary<string, object?> { ["id"] = 123, ["external_reference"] = "17", ["status"] = "approved", ["transaction_amount"] = 43.90m };
        payload[field] = value;
        await Assert.ThrowsAsync<InvalidOperationException>(() => Lookup(JsonSerializer.Serialize(payload)));
    }

    [Fact]
    public async Task NotFoundReturnsNull() => Assert.Null(await Lookup("{}", HttpStatusCode.NotFound));

    [Fact]
    public async Task HttpErrorIsNotAccepted() => await Assert.ThrowsAsync<HttpRequestException>(() => Lookup("{}", HttpStatusCode.InternalServerError));

    private static async Task<MercadoPagoPaymentSnapshot?> Lookup(string json, HttpStatusCode status = HttpStatusCode.OK)
    {
        using var http = new HttpClient(new Stub(json, status));
        return await new MercadoPagoPaymentLookup(http, Options.Create(new MercadoPagoOptions { AccessToken = "local-test-token" })).GetAsync("123");
    }
    private sealed class Stub(string json, HttpStatusCode status) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Assert.Equal("https://api.mercadopago.com/v1/payments/123", request.RequestUri!.ToString());
            return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(json) });
        }
    }
}
