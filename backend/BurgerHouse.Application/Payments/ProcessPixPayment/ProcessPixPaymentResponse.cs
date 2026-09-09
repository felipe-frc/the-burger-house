using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.ProcessPixPayment;

public sealed class ProcessPixPaymentResponse
{
    public int PaymentId { get; init; }

    public int OrderId { get; init; }

    public decimal Amount { get; init; }

    public PaymentStatus Status { get; init; }

    public string? ExternalOrderId { get; init; }

    public string? ExternalPaymentId { get; init; }

    public string? TicketUrl { get; init; }

    public string? QrCode { get; init; }

    public string? QrCodeBase64 { get; init; }
}