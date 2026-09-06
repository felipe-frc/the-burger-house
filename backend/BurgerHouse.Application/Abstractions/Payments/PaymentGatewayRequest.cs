namespace BurgerHouse.Application.Abstractions.Payments;

public class PaymentGatewayRequest
{
    public int OrderId { get; init; }
    public decimal Amount { get; init; }
    public string IdempotencyKey { get; init; } = string.Empty;

    public string PaymentToken { get; init; } = string.Empty;
    public string PaymentMethodId { get; init; } = string.Empty;
    public int Installments { get; init; }

    public string PayerEmail { get; init; } = string.Empty;
}