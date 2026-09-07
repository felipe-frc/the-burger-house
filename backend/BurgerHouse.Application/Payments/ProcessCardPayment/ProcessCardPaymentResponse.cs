using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.ProcessCardPayment;

public sealed class ProcessCardPaymentResponse
{
    public int PaymentId { get; init; }

    public int OrderId { get; init; }

    public decimal Amount { get; init; }

    public PaymentStatus Status { get; init; }

    public string? ExternalOrderId { get; init; }

    public string? ExternalPaymentId { get; init; }
}