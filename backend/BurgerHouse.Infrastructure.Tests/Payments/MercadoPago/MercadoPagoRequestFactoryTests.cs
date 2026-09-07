using System.Globalization;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using Xunit;

namespace BurgerHouse.Infrastructure.Tests.Payments.MercadoPago;

public class MercadoPagoRequestFactoryTests
{
    [Fact]
    public void Create_ShouldFormatAmountUsingInvariantCulture()
    {
        var originalCulture = CultureInfo.CurrentCulture;

        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("pt-BR");

            var request = CreateValidRequest(
                amount: 87.80m
            );

            var result = MercadoPagoRequestFactory.Create(
                request
            );

            Assert.Equal(
                "87.80",
                result.TotalAmount
            );

            Assert.Equal(
                "87.80",
                result.Transactions.Payments[0].Amount
            );
        }
        finally
        {
            CultureInfo.CurrentCulture = originalCulture;
        }
    }

    [Fact]
    public void Create_ShouldMapPaymentDataCorrectly()
    {
        var request = CreateValidRequest();

        var result = MercadoPagoRequestFactory.Create(
            request
        );

        Assert.Equal("online", result.Type);
        Assert.Equal("automatic", result.ProcessingMode);
        Assert.Equal("15", result.ExternalReference);

        Assert.Equal(
            "cliente@email.com",
            result.Payer.Email
        );

        var payment = Assert.Single(
            result.Transactions.Payments
        );

        Assert.Equal(
            "master",
            payment.PaymentMethod.Id
        );

        Assert.Equal(
            "credit_card",
            payment.PaymentMethod.Type
        );

        Assert.Equal(
            "temporary-payment-token",
            payment.PaymentMethod.Token
        );

        Assert.Equal(
            2,
            payment.PaymentMethod.Installments
        );
    }

    [Fact]
    public void Create_ShouldTrimTextValues()
    {
        var request = new PaymentGatewayRequest
        {
            OrderId = 15,
            Amount = 87.80m,
            IdempotencyKey =
                "00000000-0000-0000-0000-000000000001",
            PaymentToken = "  temporary-payment-token  ",
            PaymentMethodId = "  master  ",
            Installments = 2,
            PayerEmail = "  cliente@email.com  "
        };

        var result = MercadoPagoRequestFactory.Create(
            request
        );

        var payment = Assert.Single(
            result.Transactions.Payments
        );

        Assert.Equal(
            "temporary-payment-token",
            payment.PaymentMethod.Token
        );

        Assert.Equal(
            "master",
            payment.PaymentMethod.Id
        );

        Assert.Equal(
            "cliente@email.com",
            result.Payer.Email
        );
    }

    [Fact]
    public void Create_ShouldRejectInvalidOrderId()
    {
        var request = CreateValidRequest(
            orderId: 0
        );

        Assert.Throws<ArgumentException>(
            () => MercadoPagoRequestFactory.Create(request)
        );
    }

    [Fact]
    public void Create_ShouldRejectInvalidAmount()
    {
        var request = CreateValidRequest(
            amount: 0m
        );

        Assert.Throws<ArgumentException>(
            () => MercadoPagoRequestFactory.Create(request)
        );
    }

    [Fact]
    public void Create_ShouldRejectEmptyPaymentToken()
    {
        var request = CreateValidRequest(
            paymentToken: ""
        );

        Assert.Throws<ArgumentException>(
            () => MercadoPagoRequestFactory.Create(request)
        );
    }

    [Fact]
    public void Create_ShouldRejectInvalidInstallments()
    {
        var request = CreateValidRequest(
            installments: 0
        );

        Assert.Throws<ArgumentException>(
            () => MercadoPagoRequestFactory.Create(request)
        );
    }

    [Fact]
    public void Create_ShouldRejectEmptyPayerEmail()
    {
        var request = CreateValidRequest(
            payerEmail: ""
        );

        Assert.Throws<ArgumentException>(
            () => MercadoPagoRequestFactory.Create(request)
        );
    }

    private static PaymentGatewayRequest CreateValidRequest(
        int orderId = 15,
        decimal amount = 87.80m,
        string paymentToken = "temporary-payment-token",
        int installments = 2,
        string payerEmail = "cliente@email.com")
    {
        return new PaymentGatewayRequest
        {
            OrderId = orderId,
            Amount = amount,
            IdempotencyKey =
                "00000000-0000-0000-0000-000000000001",
            PaymentToken = paymentToken,
            PaymentMethodId = "master",
            Installments = installments,
            PayerEmail = payerEmail
        };
    }
}