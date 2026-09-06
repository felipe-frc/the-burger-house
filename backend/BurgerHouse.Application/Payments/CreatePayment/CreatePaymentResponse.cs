using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.CreatePayment;

public class CreatePaymentResponse
{
    public int PaymentId { get; init; }
    public int OrderId { get; init; }
    public decimal Amount { get; init; }
    public PaymentStatus Status { get; init; }
}