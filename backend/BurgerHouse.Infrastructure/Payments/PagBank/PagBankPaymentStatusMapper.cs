using BurgerHouse.Application.Abstractions.Payments;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public static class PagBankPaymentStatusMapper
{
    public static PaymentGatewayStatus Map(string? status, int totalAmount, int refundedAmount)
    {
        if (string.IsNullOrWhiteSpace(status))
            throw new InvalidOperationException("PagBank payment status is missing.");
        if (totalAmount <= 0 || refundedAmount < 0 || refundedAmount > totalAmount)
            throw new InvalidOperationException("PagBank refund summary is invalid.");

        return status.Trim().ToUpperInvariant() switch
        {
            "PAID" when refundedAmount == totalAmount => PaymentGatewayStatus.Refunded,
            "PAID" when refundedAmount > 0 => PaymentGatewayStatus.PartiallyRefunded,
            "PAID" => PaymentGatewayStatus.Approved,
            "AUTHORIZED" or "IN_ANALYSIS" or "WAITING" => PaymentGatewayStatus.Pending,
            "DECLINED" => PaymentGatewayStatus.Rejected,
            "CANCELED" => PaymentGatewayStatus.Cancelled,
            _ => throw new InvalidOperationException("Unsupported PagBank payment status.")
        };
    }
}
