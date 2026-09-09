using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Tests;

public class PaymentTests
{
    private const string IdempotencyKey =
        "11111111-1111-4111-8111-111111111111";

    [Fact]
    public void Constructor_ShouldCreatePendingCreditCardPaymentByDefault()
    {
        var payment = new Payment(
            orderId: 1,
            amount: 87.80m,
            idempotencyKey: IdempotencyKey
        );

        Assert.Equal(1, payment.OrderId);
        Assert.Equal(87.80m, payment.Amount);

        Assert.Equal(
            PaymentStatus.Pending,
            payment.Status
        );

        Assert.Equal(
            PaymentMethod.CreditCard,
            payment.Method
        );

        Assert.Equal(
            IdempotencyKey,
            payment.IdempotencyKey
        );

        Assert.Null(payment.ExternalPaymentId);
        Assert.NotEqual(default, payment.CreatedAt);
        Assert.Null(payment.UpdatedAt);
    }

    [Theory]
    [InlineData(PaymentMethod.Pix)]
    [InlineData(PaymentMethod.CreditCard)]
    [InlineData(PaymentMethod.DebitCard)]
    public void Constructor_ShouldCreatePaymentWithSelectedMethod(
        PaymentMethod method)
    {
        var payment = new Payment(
            orderId: 1,
            amount: 87.80m,
            idempotencyKey: IdempotencyKey,
            method: method
        );

        Assert.Equal(
            method,
            payment.Method
        );

        Assert.Equal(
            PaymentStatus.Pending,
            payment.Status
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenPaymentMethodIsInvalid()
    {
        Assert.Throws<ArgumentException>(
            () => new Payment(
                orderId: 1,
                amount: 87.80m,
                idempotencyKey: IdempotencyKey,
                method: (PaymentMethod)999
            )
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenOrderIdIsInvalid()
    {
        Assert.Throws<ArgumentException>(
            () => new Payment(
                0,
                87.80m,
                IdempotencyKey
            )
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenAmountIsInvalid()
    {
        Assert.Throws<ArgumentException>(
            () => new Payment(
                1,
                0m,
                IdempotencyKey
            )
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenIdempotencyKeyIsEmpty()
    {
        Assert.Throws<ArgumentException>(
            () => new Payment(
                1,
                87.80m,
                " "
            )
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenIdempotencyKeyIsInvalid()
    {
        Assert.Throws<ArgumentException>(
            () => new Payment(
                1,
                87.80m,
                "invalid-key"
            )
        );
    }

    [Fact]
    public void SetExternalPaymentId_ShouldSetExternalPaymentId()
    {
        var payment = new Payment(
            1,
            87.80m,
            IdempotencyKey
        );

        payment.SetExternalPaymentId("MP-123");

        Assert.Equal(
            "MP-123",
            payment.ExternalPaymentId
        );

        Assert.NotNull(payment.UpdatedAt);
    }

    [Fact]
    public void SetExternalPaymentId_ShouldThrow_WhenValueIsEmpty()
    {
        var payment = new Payment(
            1,
            87.80m,
            IdempotencyKey
        );

        Assert.Throws<ArgumentException>(
            () => payment.SetExternalPaymentId(" ")
        );
    }

    [Fact]
    public void Approve_ShouldChangeStatusToApproved()
    {
        var payment = new Payment(
            1,
            87.80m,
            IdempotencyKey
        );

        payment.Approve();

        Assert.Equal(
            PaymentStatus.Approved,
            payment.Status
        );
    }

    [Fact]
    public void Reject_ShouldChangeStatusToRejected()
    {
        var payment = new Payment(
            1,
            87.80m,
            IdempotencyKey
        );

        payment.Reject();

        Assert.Equal(
            PaymentStatus.Rejected,
            payment.Status
        );
    }

    [Fact]
    public void Cancel_ShouldChangeStatusToCancelled()
    {
        var payment = new Payment(
            1,
            87.80m,
            IdempotencyKey
        );

        payment.Cancel();

        Assert.Equal(
            PaymentStatus.Cancelled,
            payment.Status
        );
    }
}