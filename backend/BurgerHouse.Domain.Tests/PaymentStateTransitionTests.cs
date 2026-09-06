using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Tests;

public class PaymentStateTransitionTests
{
    private const string IdempotencyKey =
        "22222222-2222-4222-8222-222222222222";

    [Fact]
    public void Approve_ShouldChangePendingPaymentToApproved()
    {
        var payment = CreatePayment();

        payment.Approve();

        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.NotNull(payment.UpdatedAt);
    }

    [Fact]
    public void Reject_ShouldChangePendingPaymentToRejected()
    {
        var payment = CreatePayment();

        payment.Reject();

        Assert.Equal(PaymentStatus.Rejected, payment.Status);
    }

    [Fact]
    public void Cancel_ShouldChangePendingPaymentToCancelled()
    {
        var payment = CreatePayment();

        payment.Cancel();

        Assert.Equal(PaymentStatus.Cancelled, payment.Status);
    }

    [Fact]
    public void Reject_ShouldThrow_WhenPaymentIsAlreadyApproved()
    {
        var payment = CreatePayment();

        payment.Approve();

        Assert.Throws<InvalidOperationException>(
            () => payment.Reject()
        );

        Assert.Equal(PaymentStatus.Approved, payment.Status);
    }

    [Fact]
    public void Approve_ShouldThrow_WhenPaymentIsAlreadyRejected()
    {
        var payment = CreatePayment();

        payment.Reject();

        Assert.Throws<InvalidOperationException>(
            () => payment.Approve()
        );

        Assert.Equal(PaymentStatus.Rejected, payment.Status);
    }

    [Fact]
    public void Approve_ShouldThrow_WhenPaymentIsCancelled()
    {
        var payment = CreatePayment();

        payment.Cancel();

        Assert.Throws<InvalidOperationException>(
            () => payment.Approve()
        );

        Assert.Equal(PaymentStatus.Cancelled, payment.Status);
    }

    [Fact]
    public void SetExternalPaymentId_ShouldNotAllowReplacement()
    {
        var payment = CreatePayment();

        payment.SetExternalPaymentId("MP-123");

        Assert.Throws<InvalidOperationException>(
            () => payment.SetExternalPaymentId("MP-456")
        );

        Assert.Equal(
            "MP-123",
            payment.ExternalPaymentId
        );
    }

    [Fact]
    public void SetExternalPaymentId_ShouldAllowSameValueWhilePending()
    {
        var payment = CreatePayment();

        payment.SetExternalPaymentId("MP-123");
        payment.SetExternalPaymentId("MP-123");

        Assert.Equal(
            "MP-123",
            payment.ExternalPaymentId
        );

        Assert.Equal(
            PaymentStatus.Pending,
            payment.Status
        );
    }

    [Fact]
    public void SetExternalPaymentId_ShouldThrow_WhenPaymentIsAlreadyApproved()
    {
        var payment = CreatePayment();

        payment.Approve();

        Assert.Throws<InvalidOperationException>(
            () => payment.SetExternalPaymentId("MP-123")
        );

        Assert.Null(payment.ExternalPaymentId);
    }

    private static Payment CreatePayment()
    {
        return new Payment(
            orderId: 1,
            amount: 87.80m,
            idempotencyKey: IdempotencyKey
        );
    }
}