using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Entities;

public class Payment
{
    public int Id { get; private set; }
    public int OrderId { get; private set; }
    public decimal Amount { get; private set; }
    public PaymentStatus Status { get; private set; }
    public string? ExternalPaymentId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? UpdatedAt { get; private set; }

    public Payment(int orderId, decimal amount)
    {
        if (orderId <= 0)
            throw new ArgumentException("Order id must be greater than zero.");

        if (amount <= 0)
            throw new ArgumentException("Payment amount must be greater than zero.");

        OrderId = orderId;
        Amount = amount;
        Status = PaymentStatus.Pending;
        CreatedAt = DateTime.UtcNow;
    }

    public void SetExternalPaymentId(string externalPaymentId)
    {
        if (string.IsNullOrWhiteSpace(externalPaymentId))
            throw new ArgumentException("External payment id cannot be empty.");

        ExternalPaymentId = externalPaymentId.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void Approve()
    {
        Status = PaymentStatus.Approved;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Reject()
    {
        Status = PaymentStatus.Rejected;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Cancel()
    {
        Status = PaymentStatus.Cancelled;
        UpdatedAt = DateTime.UtcNow;
    }
}