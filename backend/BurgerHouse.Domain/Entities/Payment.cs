using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Entities;

public class Payment
{
    public int Id { get; private set; }

    public int OrderId { get; private set; }

    public decimal Amount { get; private set; }

    public PaymentStatus Status { get; private set; }

    public PaymentMethod Method { get; private set; }

    public string IdempotencyKey { get; private set; }

    public string? ExternalPaymentId { get; private set; }

    public string? ExternalCheckoutId { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public DateTime? UpdatedAt { get; private set; }

    public DateTime? ApprovedAt { get; private set; }
    public ApprovalDateSource ApprovalDateSource { get; private set; }
    public decimal RefundedAmount { get; private set; }
    // Null means a legacy payment still needs a provider-confirmed opening balance.
    public DateTime? RefundTrackingStartedAt { get; private set; }
    private readonly List<PaymentRefund> _refunds = [];
    public IReadOnlyCollection<PaymentRefund> Refunds => _refunds.AsReadOnly();

    public Payment(
        int orderId,
        decimal amount,
        string idempotencyKey,
        PaymentMethod method)
    {
        if (orderId <= 0)
        {
            throw new ArgumentException(
                "Order id must be greater than zero."
            );
        }

        if (amount <= 0)
        {
            throw new ArgumentException(
                "Payment amount must be greater than zero."
            );
        }

        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            throw new ArgumentException(
                "Idempotency key cannot be empty."
            );
        }

        if (!Enum.IsDefined(method))
        {
            throw new ArgumentException(
                "Payment method is invalid."
            );
        }

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
        Method = method;
        IdempotencyKey = parsedKey.ToString("D");
        Status = PaymentStatus.Pending;
        CreatedAt = DateTime.UtcNow;
        RefundTrackingStartedAt = CreatedAt;
    }

    public void SetMethod(PaymentMethod method)
    {
        if (!Enum.IsDefined(method) ||
            method == PaymentMethod.Unknown)
        {
            throw new ArgumentException(
                "Payment method must be a known payment method.",
                nameof(method)
            );
        }

        if (Method != PaymentMethod.Unknown)
        {
            if (Method == method)
            {
                return;
            }

            throw new InvalidOperationException(
                "Payment method has already been assigned."
            );
        }

        EnsurePending();

        Method = method;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetExternalPaymentId(string externalPaymentId)
    {
        if (string.IsNullOrWhiteSpace(externalPaymentId))
        {
            throw new ArgumentException(
                "External payment id cannot be empty."
            );
        }

        var normalizedId = externalPaymentId.Trim();

        if (ExternalPaymentId is not null)
        {
            if (ExternalPaymentId == normalizedId)
            {
                return;
            }

            throw new InvalidOperationException(
                "External payment id has already been assigned."
            );
        }

        EnsurePending();

        ExternalPaymentId = normalizedId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Approve(DateTime? observedAt = null, bool recordObservation = true)
    {
        if (Status == PaymentStatus.Approved) return;
        EnsurePending();

        if (Method == PaymentMethod.Unknown)
        {
            throw new InvalidOperationException(
                "Payment method must be defined before approval."
            );
        }

        Status = PaymentStatus.Approved;
        UpdatedAt = observedAt ?? DateTime.UtcNow;
        if (ApprovedAt is null && recordObservation)
        {
            ApprovedAt = UpdatedAt;
            ApprovalDateSource = ApprovalDateSource.Observed;
        }
    }

    public bool RecordRefundTotal(decimal total, DateTime? observedAt = null)
    {
        if (total < 0 || total > Amount || decimal.Round(total, 2) != total)
            throw new InvalidOperationException("Refund total is invalid.");
        if (total < RefundedAmount) return false;
        if (total > 0 && Status is not (PaymentStatus.Approved or PaymentStatus.PartiallyRefunded or PaymentStatus.Refunded))
            throw new InvalidOperationException("Only a settled payment can record refunds.");

        var now = observedAt ?? DateTime.UtcNow;
        if (RefundTrackingStartedAt is null)
        {
            // Reconstruct only the opening balance, never invent dated legacy events.
            RefundTrackingStartedAt = now;
            RefundedAmount = total;
            UpdatedAt = now;
            return true;
        }
        if (total == RefundedAmount) return false;
        _refunds.Add(new PaymentRefund(total - RefundedAmount, total, now));
        RefundedAmount = total;
        UpdatedAt = now;
        return true;
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

    public void Refund(bool partial = false)
    {
        var target = partial
            ? PaymentStatus.PartiallyRefunded
            : PaymentStatus.Refunded;

        if (Status == target)
            return;

        if (Status is not (PaymentStatus.Approved or PaymentStatus.PartiallyRefunded))
            throw new InvalidOperationException("Only a settled payment can be refunded.");

        Status = target;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetExternalCheckoutId(string externalCheckoutId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(externalCheckoutId);
        var normalized = externalCheckoutId.Trim();
        if (ExternalCheckoutId == normalized) return;
        if (ExternalCheckoutId is not null)
            throw new InvalidOperationException("External checkout id has already been assigned.");
        EnsurePending();
        ExternalCheckoutId = normalized;
        UpdatedAt = DateTime.UtcNow;
    }

    public bool HasHostedCheckout() => ExternalCheckoutId is not null;

    public void ChargeBack()
    {
        if (Status == PaymentStatus.ChargedBack)
            return;

        if (Status is not (PaymentStatus.Approved or PaymentStatus.PartiallyRefunded))
            throw new InvalidOperationException("Only a settled payment can be charged back.");

        Status = PaymentStatus.ChargedBack;
        UpdatedAt = DateTime.UtcNow;
    }

    private void EnsurePending()
    {
        if (Status != PaymentStatus.Pending)
        {
            throw new InvalidOperationException(
                $"Payment in status '{Status}' cannot be changed."
            );
        }
    }
}
