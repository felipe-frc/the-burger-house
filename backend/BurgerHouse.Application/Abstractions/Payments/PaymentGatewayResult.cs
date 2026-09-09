namespace BurgerHouse.Application.Abstractions.Payments;

public class PaymentGatewayResult
{
    public string ExternalOrderId { get; init; } =
        string.Empty;

    public string ExternalPaymentId { get; init; } =
        string.Empty;

    public PaymentGatewayStatus Status { get; init; }

    public string? StatusDetail { get; init; }

    public string? PixTicketUrl { get; init; }

    public string? PixQrCode { get; init; }

    public string? PixQrCodeBase64 { get; init; }
}