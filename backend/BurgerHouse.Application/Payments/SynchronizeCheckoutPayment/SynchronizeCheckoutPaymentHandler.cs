using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;

public sealed class SynchronizeCheckoutPaymentHandler(IPaymentRepository payments, IOrderRepository orders)
{
    public async Task<bool> HandleAsync(int paymentId, string externalPaymentId, decimal amount,
        string? currency, PaymentMethod method, PaymentGatewayStatus status, CancellationToken ct = default)
    {
        var payment = await payments.GetByIdAsync(paymentId, ct)
            ?? throw new KeyNotFoundException("Local payment was not found.");
        var order = await orders.GetByIdAsync(payment.OrderId, ct)
            ?? throw new KeyNotFoundException("Payment order was not found.");
        if (payment.ExternalPreferenceId is null)
            throw new InvalidOperationException("Payment is not linked to Checkout Pro.");
        if (amount != payment.Amount || amount != order.Total || currency != "BRL")
            throw new InvalidOperationException("Payment amount or currency does not match the order.");
        if (string.IsNullOrWhiteSpace(externalPaymentId) || method == PaymentMethod.Unknown || !Enum.IsDefined(method))
            throw new InvalidOperationException("Payment identification or method is invalid.");
        if (payment.ExternalPaymentId is not null && payment.ExternalPaymentId != externalPaymentId)
            throw new InvalidOperationException("Payment is already linked to a different external payment.");
        if (payment.Method != PaymentMethod.Unknown && payment.Method != method)
            throw new InvalidOperationException("Payment method does not match the recorded method.");

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

        var previousUpdate = payment.UpdatedAt;
        var previousOrderStatus = order.Status;
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
                        if (payment.Status == PaymentStatus.Pending) payment.Approve();
                        if (target == PaymentStatus.ChargedBack) payment.ChargeBack();
                        else payment.Refund(target == PaymentStatus.PartiallyRefunded);
                        break;
                }
            }
        }
        if (payment.Status == PaymentStatus.Approved && order.Status == OrderStatus.PendingPayment)
            order.MarkAsReceived();

        var changed = previousUpdate != payment.UpdatedAt || previousOrderStatus != order.Status;
        if (changed) await payments.SaveChangesAsync(ct);
        return changed;
    }
}
