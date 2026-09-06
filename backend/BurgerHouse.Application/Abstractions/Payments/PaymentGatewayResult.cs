namespace BurgerHouse.Application.Abstractions.Payments;

public class PaymentGatewayResult
{
    public string ExternalOrderId { get; init; } = string.Empty;
    public string ExternalPaymentId { get; init; } = string.Empty;
    public PaymentGatewayStatus Status { get; init; }
    public string? StatusDetail { get; init; }
}