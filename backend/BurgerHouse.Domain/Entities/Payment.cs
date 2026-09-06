using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Entities;

public class Payment
{
    public int Id { get; private set; }
    public int OrderId { get; private set; }
    public decimal Amount { get; private set; }
    public PaymentStatus Status { get; private set; }
    public string IdempotencyKey { get; private set; }
    public string? ExternalOrderId { get; private set; }
    public string? ExternalPaymentId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? UpdatedAt { get; private set; }

    public Payment(
        int orderId,
        decimal amount,
        string idempotencyKey)
    {
        if (orderId <= 0)
            throw new ArgumentException(
                "Order id must be greater than zero."
            );

        if (amount <= 0)
            throw new ArgumentException(
                "Payment amount must be greater than zero."
            );

        if (string.IsNullOrWhiteSpace(idempotencyKey))
            throw new ArgumentException(
                "Idempotency key cannot be empty."
            );

        var normalizedKey = idempotencyKey.Trim();

        if (!Guid.TryParseExact(
                normalizedKey,
                "D",
                out var parsedKey))
        {
            throw new ArgumentException(
                "Idempotency key must be a valid UUID."
            );
        }

        OrderId = orderId;
        Amount = amount;
        IdempotencyKey = parsedKey.ToString("D");
        Status = PaymentStatus.Pending;
        CreatedAt = DateTime.UtcNow;
    }

    public void SetExternalOrderId(string externalOrderId)
    {
        EnsurePending();

        if (string.IsNullOrWhiteSpace(externalOrderId))
            throw new ArgumentException(
                "External order id cannot be empty."
            );

        var normalizedId = externalOrderId.Trim();

        if (ExternalOrderId is not null)
        {
            if (ExternalOrderId == normalizedId)
                return;

            throw new InvalidOperationException(
                "External order id has already been assigned."
            );
        }

        ExternalOrderId = normalizedId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetExternalPaymentId(string externalPaymentId)
    {
        EnsurePending();

        if (string.IsNullOrWhiteSpace(externalPaymentId))
            throw new ArgumentException(
                "External payment id cannot be empty."
            );

        var normalizedId = externalPaymentId.Trim();

        if (ExternalPaymentId is not null)
        {
            if (ExternalPaymentId == normalizedId)
                return;

            throw new InvalidOperationException(
                "External payment id has already been assigned."
            );
        }

        ExternalPaymentId = normalizedId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Approve()
    {
        EnsurePending();

        Status = PaymentStatus.Approved;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Reject()
    {
        EnsurePending();

        Status = PaymentStatus.Rejected;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Cancel()
    {
        EnsurePending();

        Status = PaymentStatus.Cancelled;
        UpdatedAt = DateTime.UtcNow;
    }

    private void EnsurePending()
    {
        if (Status != PaymentStatus.Pending)
            throw new InvalidOperationException(
                $"Payment in status '{Status}' cannot be changed."
            );
    }
}