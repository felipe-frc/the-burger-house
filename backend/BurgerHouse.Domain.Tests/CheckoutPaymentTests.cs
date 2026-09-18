using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Tests;

public class CheckoutPaymentTests
{
    private static Payment Create() => new(1, 43.90m, Guid.NewGuid().ToString("D"), PaymentMethod.Unknown);

    [Fact]
    public void UnknownPaymentStartsPendingAndCannotBeApproved()
    {
        var payment = Create();
        Assert.Equal(PaymentMethod.Unknown, payment.Method);
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Throws<InvalidOperationException>(() => payment.Approve());
    }

    [Theory]
    [InlineData(PaymentMethod.Pix)]
    [InlineData(PaymentMethod.CreditCard)]
    [InlineData(PaymentMethod.DebitCard)]
    [InlineData(PaymentMethod.AccountMoney)]
    [InlineData(PaymentMethod.PrepaidCard)]
    public void MethodCanBeDefinedOnceAndRepeatedAfterApproval(PaymentMethod method)
    {
        var payment = Create();
        payment.SetMethod(method);
        payment.Approve();
        var updatedAt = payment.UpdatedAt;
        payment.SetMethod(method);
        Assert.Equal(method, payment.Method);
        Assert.Equal(updatedAt, payment.UpdatedAt);
        var other = method == PaymentMethod.Pix ? PaymentMethod.CreditCard : PaymentMethod.Pix;
        Assert.Throws<InvalidOperationException>(() => payment.SetMethod(other));
    }

    [Theory]
    [InlineData(PaymentMethod.Unknown)]
    [InlineData((PaymentMethod)999)]
    public void InvalidMethodCannotBeAssigned(PaymentMethod method)
    {
        Assert.Throws<ArgumentException>(() => Create().SetMethod(method));
    }

    [Fact]
    public void RejectedPaymentCannotAcquireMethod()
    {
        var payment = Create();
        payment.Reject();
        Assert.Throws<InvalidOperationException>(() => payment.SetMethod(PaymentMethod.Pix));
    }

    [Fact]
    public void PartialThenFullRefundPreservesFinancialStateAndIsIdempotent()
    {
        var payment = Create();
        payment.SetMethod(PaymentMethod.Pix);
        payment.Approve();
        payment.Refund(partial: true);
        Assert.Equal(PaymentStatus.PartiallyRefunded, payment.Status);
        var updatedAt = payment.UpdatedAt;
        payment.Refund(partial: true);
        Assert.Equal(updatedAt, payment.UpdatedAt);
        payment.Refund();
        Assert.Equal(PaymentStatus.Refunded, payment.Status);
        updatedAt = payment.UpdatedAt;
        payment.Refund();
        Assert.Equal(updatedAt, payment.UpdatedAt);
        Assert.Throws<InvalidOperationException>(() => payment.Refund(partial: true));
        Assert.Throws<InvalidOperationException>(() => payment.Approve());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ChargeBackAfterSettlementIsIdempotent(bool partiallyRefunded)
    {
        var payment = Create();
        payment.SetMethod(PaymentMethod.CreditCard);
        payment.Approve();
        if (partiallyRefunded) payment.Refund(partial: true);
        payment.ChargeBack();
        Assert.Equal(PaymentStatus.ChargedBack, payment.Status);
        var updatedAt = payment.UpdatedAt;
        payment.ChargeBack();
        Assert.Equal(updatedAt, payment.UpdatedAt);
        Assert.Throws<InvalidOperationException>(() => payment.Reject());
    }

    [Theory]
    [InlineData(PaymentStatus.Pending)]
    [InlineData(PaymentStatus.Rejected)]
    [InlineData(PaymentStatus.Cancelled)]
    public void UnsettledPaymentsCannotBeRefundedOrChargedBack(PaymentStatus status)
    {
        var payment = Create();
        if (status == PaymentStatus.Rejected) payment.Reject();
        if (status == PaymentStatus.Cancelled) payment.Cancel();
        Assert.Throws<InvalidOperationException>(() => payment.Refund());
        Assert.Throws<InvalidOperationException>(() => payment.Refund(partial: true));
        Assert.Throws<InvalidOperationException>(() => payment.ChargeBack());
        Assert.Equal(status, payment.Status);
    }
}
