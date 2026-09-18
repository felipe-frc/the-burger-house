using BurgerHouse.Application.Abstractions.Payments;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public static class MercadoPagoPaymentStatusMapper
{
    public static PaymentGatewayStatus Map(
        string status,
        string? statusDetail)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            throw new ArgumentException(
                "Mercado Pago payment status cannot be empty.",
                nameof(status)
            );
        }

        var normalizedStatus =
            status.Trim().ToLowerInvariant();

        var normalizedDetail =
            statusDetail?
                .Trim()
                .ToLowerInvariant();

        return normalizedStatus switch
        {
            "approved"
                when normalizedDetail == "partially_refunded"
                => PaymentGatewayStatus.PartiallyRefunded,

            "approved"
                => PaymentGatewayStatus.Approved,

            "authorized"
                => PaymentGatewayStatus.Pending,

            "in_process"
                => PaymentGatewayStatus.Pending,

            "pending"
                => PaymentGatewayStatus.Pending,

            "rejected"
                => PaymentGatewayStatus.Rejected,

            "cancelled"
                => PaymentGatewayStatus.Cancelled,

            "refunded"
                => PaymentGatewayStatus.Refunded,

            "charged_back"
                => PaymentGatewayStatus.ChargedBack,

            _ => throw new InvalidOperationException("Unsupported Mercado Pago payment status.")
        };
    }
}