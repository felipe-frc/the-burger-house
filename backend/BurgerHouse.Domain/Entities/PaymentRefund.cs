namespace BurgerHouse.Domain.Entities;

public sealed class PaymentRefund
{
    public int Id { get; private set; }
    public int PaymentId { get; private set; }
    public decimal Amount { get; private set; }
    // First local observation of this increment, not the provider's execution date.
    public DateTime CreatedAt { get; private set; }
    public decimal CumulativeRefundedAmount { get; private set; }

    private PaymentRefund() { }

    internal PaymentRefund(decimal amount, decimal cumulativeRefundedAmount, DateTime observedAt)
    {
        Amount = amount;
        CumulativeRefundedAmount = cumulativeRefundedAmount;
        CreatedAt = observedAt;
    }
}
