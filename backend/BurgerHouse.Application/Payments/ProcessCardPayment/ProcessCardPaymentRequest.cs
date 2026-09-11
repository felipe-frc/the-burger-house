namespace BurgerHouse.Application.Payments.ProcessCardPayment;

public sealed class ProcessCardPaymentRequest
{
    public int PaymentId { get; init; }

    public string PaymentToken { get; init; } =
        string.Empty;

    public string PaymentMethodId { get; init; } =
        string.Empty;

    public string PaymentTypeId { get; init; } =
        string.Empty;

    public int Installments { get; init; }

    public string PayerEmail { get; init; } =
        string.Empty;

    public string PayerIdentificationType
    {
        get;
        init;
    } = string.Empty;

    public string PayerIdentificationNumber
    {
        get;
        init;
    } = string.Empty;
}