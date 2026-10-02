using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.GetPaymentStatus;

public sealed class GetPaymentStatusResponse
{
    public int PaymentId { get; init; }

    public int OrderId { get; init; }

    public decimal Amount { get; init; }

    public PaymentStatus Status { get; init; }

    public PaymentMethod Method { get; init; }

    public DateTime CreatedAt { get; init; }

    public DateTime? UpdatedAt { get; init; }
}