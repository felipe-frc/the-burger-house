using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Tests;

public class PaymentTests
{
    [Fact]
    public void FinancialHistoryTracksOnlyPositiveDeltasAndImmutableApproval()
    {
        var payment = new Payment(1, 100m, Guid.NewGuid().ToString(), PaymentMethod.Pix);
        var approved = new DateTime(2026, 10, 1, 15, 0, 0, DateTimeKind.Utc);
        payment.Approve(approved);
        payment.Approve(approved.AddDays(1));
        Assert.Equal(approved, payment.ApprovedAt);
        Assert.Equal(ApprovalDateSource.Observed, payment.ApprovalDateSource);
        payment.Refund(true);
        Assert.True(payment.RecordRefundTotal(30, approved.AddDays(4)));
        var updated = payment.UpdatedAt;
        Assert.False(payment.RecordRefundTotal(30, approved.AddDays(5)));
        Assert.False(payment.RecordRefundTotal(20, approved.AddDays(6)));
        Assert.Equal(updated, payment.UpdatedAt);
        payment.RecordRefundTotal(50, approved.AddDays(9));
        payment.Refund();
        payment.RecordRefundTotal(100, approved.AddDays(10));
        Assert.Equal(new decimal[] { 30, 20, 50 }, payment.Refunds.Select(r => r.Amount));
        Assert.Equal(new decimal[] { 30, 50, 100 }, payment.Refunds.Select(r => r.CumulativeRefundedAmount));
        Assert.Equal(approved.AddDays(4), payment.Refunds.First().CreatedAt);
        Assert.Equal(100, payment.RefundedAmount);
        Assert.Equal(approved, payment.ApprovedAt);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(101)]
    public void InvalidRefundTotalsNeverMutateHistory(decimal total)
    {
        var payment = new Payment(1, 100m, Guid.NewGuid().ToString(), PaymentMethod.CreditCard);
        payment.Approve();
        Assert.Throws<InvalidOperationException>(() => payment.RecordRefundTotal(total));
        Assert.Empty(payment.Refunds); Assert.Equal(0, payment.RefundedAmount);
    }

    [Fact]
    public void ChargebackPreservesApprovalWithoutInventingRefund()
    {
        var payment = new Payment(1, 100m, Guid.NewGuid().ToString(), PaymentMethod.CreditCard);
        payment.Approve();
        var approved = payment.ApprovedAt;
        payment.ChargeBack();
        Assert.Equal(approved, payment.ApprovedAt);
        Assert.Empty(payment.Refunds); Assert.Equal(0, payment.RefundedAmount);
    }

    private const string IdempotencyKey =
        "11111111-1111-4111-8111-111111111111";

    [Fact]
    public void Constructor_ShouldCreatePendingPaymentWithExplicitMethod()
    {
        var payment = new Payment(
            orderId: 1,
            amount: 87.80m,
            idempotencyKey: IdempotencyKey,
            method: PaymentMethod.CreditCard
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
                IdempotencyKey,
                PaymentMethod.CreditCard
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
                IdempotencyKey,
                PaymentMethod.CreditCard
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
                " ",
                PaymentMethod.CreditCard
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
                "invalid-key",
                PaymentMethod.CreditCard
            )
        );
    }

    [Fact]
    public void SetExternalPaymentId_ShouldSetExternalPaymentId()
    {
        var payment = new Payment(
            1,
            87.80m,
            IdempotencyKey,
            PaymentMethod.CreditCard
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
            IdempotencyKey,
            PaymentMethod.CreditCard
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
            IdempotencyKey,
            PaymentMethod.CreditCard
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
            IdempotencyKey,
            PaymentMethod.CreditCard
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
            IdempotencyKey,
            PaymentMethod.CreditCard
        );

        payment.Cancel();

        Assert.Equal(
            PaymentStatus.Cancelled,
            payment.Status
        );
    }
}
