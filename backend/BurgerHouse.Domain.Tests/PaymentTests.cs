using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Tests;

public class PaymentTests
{
    [Fact]
    public void Constructor_ShouldCreatePendingPayment()
    {
        var payment = new Payment(
            orderId: 1,
            amount: 58m
        );

        Assert.Equal(1, payment.OrderId);
        Assert.Equal(58m, payment.Amount);
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Null(payment.ExternalPaymentId);
        Assert.Null(payment.UpdatedAt);
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenOrderIdIsInvalid()
    {
        Assert.Throws<ArgumentException>(
            () => new Payment(0, 58m)
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenAmountIsInvalid()
    {
        Assert.Throws<ArgumentException>(
            () => new Payment(1, 0m)
        );
    }

    [Fact]
    public void SetExternalPaymentId_ShouldSetValue()
    {
        var payment = new Payment(1, 58m);

        payment.SetExternalPaymentId("123456789");

        Assert.Equal("123456789", payment.ExternalPaymentId);
        Assert.NotNull(payment.UpdatedAt);
    }

    [Fact]
    public void SetExternalPaymentId_ShouldTrimValue()
    {
        var payment = new Payment(1, 58m);

        payment.SetExternalPaymentId("  123456789  ");

        Assert.Equal("123456789", payment.ExternalPaymentId);
    }

    [Fact]
    public void SetExternalPaymentId_ShouldThrow_WhenValueIsEmpty()
    {
        var payment = new Payment(1, 58m);

        Assert.Throws<ArgumentException>(
            () => payment.SetExternalPaymentId("   ")
        );
    }

    [Fact]
    public void Approve_ShouldChangeStatusToApproved()
    {
        var payment = new Payment(1, 58m);

        payment.Approve();

        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.NotNull(payment.UpdatedAt);
    }

    [Fact]
    public void Reject_ShouldChangeStatusToRejected()
    {
        var payment = new Payment(1, 58m);

        payment.Reject();

        Assert.Equal(PaymentStatus.Rejected, payment.Status);
        Assert.NotNull(payment.UpdatedAt);
    }

    [Fact]
    public void Cancel_ShouldChangeStatusToCancelled()
    {
        var payment = new Payment(1, 58m);

        payment.Cancel();

        Assert.Equal(PaymentStatus.Cancelled, payment.Status);
        Assert.NotNull(payment.UpdatedAt);
    }
}