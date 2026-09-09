using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.CreatePayment;

public class CreatePaymentRequest
{
    public int OrderId { get; init; }

    public string IdempotencyKey { get; init; } =
        string.Empty;

    public PaymentMethod Method { get; init; } =
        PaymentMethod.CreditCard;
}