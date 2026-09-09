namespace BurgerHouse.Application.Payments.ProcessPixPayment;

public sealed class ProcessPixPaymentRequest
{
    public int PaymentId { get; init; }

    public string PayerEmail { get; init; } =
        string.Empty;
}