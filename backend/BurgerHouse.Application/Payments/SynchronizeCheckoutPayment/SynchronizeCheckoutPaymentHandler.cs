using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;

public sealed class SynchronizeCheckoutPaymentHandler(IPaymentRepository payments, IOrderRepository orders)
{
    public async Task<bool> HandleAsync(int paymentId, string externalPaymentId, decimal amount,
        string? currency, PaymentMethod method,
        PaymentGatewayStatus status, CancellationToken ct = default, decimal refundedAmount = 0)
    {
        var payment = await payments.GetByIdAsync(paymentId, ct)
            ?? throw new KeyNotFoundException("Local payment was not found.");
        var order = await orders.GetByIdAsync(payment.OrderId, ct)
            ?? throw new KeyNotFoundException("Payment order was not found.");
        if (!payment.HasHostedCheckout())
            throw new InvalidOperationException("Payment is not linked to a hosted checkout.");
        if (amount != payment.Amount || amount != order.Total || currency != "BRL")
            throw new InvalidOperationException("Payment amount or currency does not match the order.");
        if (string.IsNullOrWhiteSpace(externalPaymentId) || !Enum.IsDefined(method))
            throw new InvalidOperationException("Payment identification or method is invalid.");
        if ((status is PaymentGatewayStatus.Approved or PaymentGatewayStatus.Refunded or
            PaymentGatewayStatus.PartiallyRefunded or PaymentGatewayStatus.ChargedBack) &&
            method == PaymentMethod.Unknown)
            throw new InvalidOperationException("A settled payment must have a known payment method.");
        if (payment.ExternalPaymentId is not null && payment.ExternalPaymentId != externalPaymentId)
            throw new InvalidOperationException("Payment is already linked to a different external payment.");
        if (method != PaymentMethod.Unknown &&
            payment.Method != PaymentMethod.Unknown && payment.Method != method)
            throw new InvalidOperationException("Payment method does not match the recorded method.");
        if (refundedAmount < 0 || refundedAmount > payment.Amount || decimal.Round(refundedAmount, 2) != refundedAmount)
            throw new InvalidOperationException("Refund total is invalid.");
        if (refundedAmount < payment.RefundedAmount) return false;
        if (status == PaymentGatewayStatus.PartiallyRefunded && (refundedAmount <= 0 || refundedAmount >= amount) ||
            status == PaymentGatewayStatus.Refunded && refundedAmount != amount)
            throw new InvalidOperationException("Refund status and total are inconsistent.");

        var target = status switch
        {
            PaymentGatewayStatus.Pending => PaymentStatus.Pending,
            PaymentGatewayStatus.Approved => PaymentStatus.Approved,
            PaymentGatewayStatus.Rejected => PaymentStatus.Rejected,
            PaymentGatewayStatus.Cancelled => PaymentStatus.Cancelled,
            PaymentGatewayStatus.Refunded => PaymentStatus.Refunded,
            PaymentGatewayStatus.PartiallyRefunded => PaymentStatus.PartiallyRefunded,
            PaymentGatewayStatus.ChargedBack => PaymentStatus.ChargedBack,
            _ => throw new InvalidOperationException("Unsupported payment status.")
        };
        if (order.Status == OrderStatus.Cancelled && target == PaymentStatus.Approved)
            throw new InvalidOperationException("A cancelled order cannot be received.");

        // Ignore stale snapshots without moving settled payments back to approval/pending.
        if (payment.Status is PaymentStatus.PartiallyRefunded or PaymentStatus.Refunded or PaymentStatus.ChargedBack &&
            target is PaymentStatus.Pending or PaymentStatus.Approved)
            return false;

        var previousUpdate = payment.UpdatedAt;
        var previousOrderStatus = order.Status;
        if (method != PaymentMethod.Unknown)
            payment.SetMethod(method);
        payment.SetExternalPaymentId(externalPaymentId);
        if (payment.Status != target)
        {
            // Never regress settled or terminal payments on a delayed pending notification.
            if (target != PaymentStatus.Pending)
            {
                switch (target)
                {
                    case PaymentStatus.Approved: payment.Approve(); break;
                    case PaymentStatus.Rejected: payment.Reject(); break;
                    case PaymentStatus.Cancelled: payment.Cancel(); break;
                    case PaymentStatus.Refunded:
                    case PaymentStatus.PartiallyRefunded:
                    case PaymentStatus.ChargedBack:
                        // The first notification may arrive after settlement and refund/chargeback.
                        if (payment.Status == PaymentStatus.Pending)
                            payment.Approve(recordObservation: payment.RefundTrackingStartedAt.HasValue);
                        if (target == PaymentStatus.ChargedBack) payment.ChargeBack();
                        else payment.Refund(target == PaymentStatus.PartiallyRefunded);
                        break;
                }
            }
        }
        var financialChange = false;
        if (target != PaymentStatus.ChargedBack && payment.Status != PaymentStatus.ChargedBack)
            financialChange = payment.RecordRefundTotal(refundedAmount);
        if (payment.Status == PaymentStatus.Approved && order.Status == OrderStatus.PendingPayment)
            order.MarkAsReceived();

        var changed = financialChange || previousUpdate != payment.UpdatedAt || previousOrderStatus != order.Status;
        if (changed) await payments.SaveChangesAsync(ct);
        return changed;
    }
}
