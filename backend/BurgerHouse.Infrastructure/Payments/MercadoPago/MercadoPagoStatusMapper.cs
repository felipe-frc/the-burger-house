using BurgerHouse.Application.Abstractions.Payments;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

internal static class MercadoPagoStatusMapper
{
    public static PaymentGatewayStatus Map(
        string status,
        string? statusDetail)
    {
        var normalizedStatus = status
            .Trim()
            .ToLowerInvariant();

        var normalizedDetail = statusDetail?
            .Trim()
            .ToLowerInvariant();

        return normalizedStatus switch
        {
            "created" => PaymentGatewayStatus.Pending,

            "processing" => PaymentGatewayStatus.Pending,

            "action_required" => PaymentGatewayStatus.Pending,

            "in_review" => PaymentGatewayStatus.Pending,

            "processed"
                when normalizedDetail == "partially_refunded"
                => PaymentGatewayStatus.PartiallyRefunded,

            "processed"
                when normalizedDetail == "accredited"
                => PaymentGatewayStatus.Approved,

            "failed" => PaymentGatewayStatus.Rejected,

            "canceled"
                when normalizedDetail == "expired"
                => PaymentGatewayStatus.Expired,

            "canceled" => PaymentGatewayStatus.Cancelled,

            "expired" => PaymentGatewayStatus.Expired,

            "refunded" => PaymentGatewayStatus.Refunded,

            "charged_back" => PaymentGatewayStatus.ChargedBack,

            _ => PaymentGatewayStatus.Pending
        };
    }
}