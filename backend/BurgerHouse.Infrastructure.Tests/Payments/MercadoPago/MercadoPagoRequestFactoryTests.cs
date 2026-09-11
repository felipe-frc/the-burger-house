using System.Globalization;

using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.MercadoPago;

using Xunit;

namespace BurgerHouse.Infrastructure.Tests.Payments.MercadoPago;

public class MercadoPagoRequestFactoryTests
{
    [Fact]
    public void Create_ShouldFormatAmountUsingInvariantCulture()
    {
        var originalCulture =
            CultureInfo.CurrentCulture;

        try
        {
            CultureInfo.CurrentCulture =
                new CultureInfo("pt-BR");

            var request =
                CreateValidRequest(
                    amount: 87.80m
                );

            var result =
                MercadoPagoRequestFactory.Create(
                    request
                );

            Assert.Equal(
                "87.80",
                result.TotalAmount
            );

            Assert.Equal(
                "87.80",
                result
                    .Transactions
                    .Payments[0]
                    .Amount
            );
        }
        finally
        {
            CultureInfo.CurrentCulture =
                originalCulture;
        }
    }

    [Fact]
    public void Create_ShouldMapCreditCardCorrectly()
    {
        var request =
            CreateValidRequest();

        var result =
            MercadoPagoRequestFactory.Create(
                request
            );

        Assert.Equal(
            "online",
            result.Type
        );

        Assert.Equal(
            "automatic",
            result.ProcessingMode
        );

        Assert.Equal(
            "15",
            result.ExternalReference
        );

        Assert.Equal(
            "cliente@email.com",
            result.Payer.Email
        );

        Assert.NotNull(
            result.Payer.Identification
        );

        Assert.Equal(
            "CPF",
            result.Payer.Identification.Type
        );

        Assert.Equal(
            "12345678909",
            result.Payer.Identification.Number
        );

        var payment =
            Assert.Single(
                result
                    .Transactions
                    .Payments
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

    [Theory]
    [InlineData("elo", "debelo")]
    [InlineData("master", "debmaster")]
    [InlineData("visa", "debvisa")]
    [InlineData("debelo", "debelo")]
    [InlineData("debmaster", "debmaster")]
    [InlineData("debvisa", "debvisa")]
    public void Create_ShouldMapDebitCardIdentifierCorrectly(
        string receivedPaymentMethodId,
        string expectedPaymentMethodId)
    {
        var request =
            CreateValidRequest(
                paymentMethodId:
                    receivedPaymentMethodId,
                installments: 1,
                method:
                    PaymentMethod.DebitCard
            );

        var result =
            MercadoPagoRequestFactory.Create(
                request
            );

        var payment =
            Assert.Single(
                result
                    .Transactions
                    .Payments
            );

        Assert.Equal(
            expectedPaymentMethodId,
            payment.PaymentMethod.Id
        );

        Assert.Equal(
            "debit_card",
            payment.PaymentMethod.Type
        );

        Assert.Equal(
            1,
            payment.PaymentMethod.Installments
        );

        Assert.NotNull(
            result.Payer.Identification
        );

        Assert.Equal(
            "CPF",
            result.Payer.Identification.Type
        );

        Assert.Equal(
            "12345678909",
            result.Payer.Identification.Number
        );
    }

    [Fact]
    public void Create_ShouldRejectDebitCardWithMoreThanOneInstallment()
    {
        var request =
            CreateValidRequest(
                installments: 2,
                method:
                    PaymentMethod.DebitCard
            );

        Assert.Throws<ArgumentException>(
            () =>
                MercadoPagoRequestFactory
                    .Create(request)
        );
    }

    [Fact]
    public void Create_ShouldMapPixWithoutCardData()
    {
        var request =
            new PaymentGatewayRequest
            {
                OrderId = 15,

                Amount = 87.80m,

                IdempotencyKey =
                    "00000000-0000-0000-0000-000000000001",

                Method =
                    PaymentMethod.Pix,

                PayerEmail =
                    "cliente@email.com"
            };

        var result =
            MercadoPagoRequestFactory.Create(
                request
            );

        var payment =
            Assert.Single(
                result
                    .Transactions
                    .Payments
            );

        Assert.Equal(
            "pix",
            payment.PaymentMethod.Id
        );

        Assert.Equal(
            "bank_transfer",
            payment.PaymentMethod.Type
        );

        Assert.Null(
            payment.PaymentMethod.Token
        );

        Assert.Null(
            payment.PaymentMethod.Installments
        );

        Assert.Null(
            result.Payer.Identification
        );
    }

    [Fact]
    public void Create_ShouldTrimTextValues()
    {
        var request =
            CreateValidRequest(
                paymentToken:
                    "  temporary-payment-token  ",
                paymentMethodId:
                    "  master  ",
                payerEmail:
                    "  cliente@email.com  ",
                payerIdentificationType:
                    "  CPF  ",
                payerIdentificationNumber:
                    "  12345678909  "
            );

        var result =
            MercadoPagoRequestFactory.Create(
                request
            );

        var payment =
            Assert.Single(
                result
                    .Transactions
                    .Payments
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

        Assert.NotNull(
            result.Payer.Identification
        );

        Assert.Equal(
            "CPF",
            result.Payer.Identification.Type
        );

        Assert.Equal(
            "12345678909",
            result.Payer.Identification.Number
        );
    }

    [Fact]
    public void Create_ShouldRejectIncompleteIdentification()
    {
        var request =
            CreateValidRequest(
                payerIdentificationNumber:
                    string.Empty
            );

        Assert.Throws<ArgumentException>(
            () =>
                MercadoPagoRequestFactory
                    .Create(request)
        );
    }

    [Fact]
    public void Create_ShouldRejectInvalidOrderId()
    {
        var request =
            CreateValidRequest(
                orderId: 0
            );

        Assert.Throws<ArgumentException>(
            () =>
                MercadoPagoRequestFactory
                    .Create(request)
        );
    }

    [Fact]
    public void Create_ShouldRejectInvalidAmount()
    {
        var request =
            CreateValidRequest(
                amount: 0m
            );

        Assert.Throws<ArgumentException>(
            () =>
                MercadoPagoRequestFactory
                    .Create(request)
        );
    }

    [Fact]
    public void Create_ShouldRejectEmptyPaymentTokenForCard()
    {
        var request =
            CreateValidRequest(
                paymentToken:
                    string.Empty
            );

        Assert.Throws<ArgumentException>(
            () =>
                MercadoPagoRequestFactory
                    .Create(request)
        );
    }

    [Fact]
    public void Create_ShouldRejectInvalidInstallmentsForCreditCard()
    {
        var request =
            CreateValidRequest(
                installments: 0
            );

        Assert.Throws<ArgumentException>(
            () =>
                MercadoPagoRequestFactory
                    .Create(request)
        );
    }

    [Fact]
    public void Create_ShouldRejectEmptyPayerEmail()
    {
        var request =
            CreateValidRequest(
                payerEmail:
                    string.Empty
            );

        Assert.Throws<ArgumentException>(
            () =>
                MercadoPagoRequestFactory
                    .Create(request)
        );
    }

    private static PaymentGatewayRequest
        CreateValidRequest(
            int orderId = 15,
            decimal amount = 87.80m,
            string paymentToken =
                "temporary-payment-token",
            string paymentMethodId =
                "master",
            int installments = 2,
            string payerEmail =
                "cliente@email.com",
            string payerIdentificationType =
                "CPF",
            string payerIdentificationNumber =
                "12345678909",
            PaymentMethod method =
                PaymentMethod.CreditCard)
    {
        return new PaymentGatewayRequest
        {
            OrderId =
                orderId,

            Amount =
                amount,

            IdempotencyKey =
                "00000000-0000-0000-0000-000000000001",

            Method =
                method,

            PaymentToken =
                paymentToken,

            PaymentMethodId =
                paymentMethodId,

            Installments =
                installments,

            PayerEmail =
                payerEmail,

            PayerIdentificationType =
                payerIdentificationType,

            PayerIdentificationNumber =
                payerIdentificationNumber
        };
    }
}