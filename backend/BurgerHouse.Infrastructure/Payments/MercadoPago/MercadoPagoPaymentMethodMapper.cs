using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public static class MercadoPagoPaymentMethodMapper
{
    public static PaymentMethod Map(string? type, string? method)
    {
        type = type?.Trim().ToLowerInvariant();
        method = method?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(method))
            throw new InvalidOperationException("Payment method is missing.");
        return (type, method) switch
        {
            ("bank_transfer", "pix") => PaymentMethod.Pix,
            ("account_money", "account_money") => PaymentMethod.AccountMoney,
            ("credit_card", not ("pix" or "account_money")) => PaymentMethod.CreditCard,
            ("debit_card", not ("pix" or "account_money")) => PaymentMethod.DebitCard,
            ("prepaid_card", not ("pix" or "account_money")) => PaymentMethod.PrepaidCard,
            _ => throw new InvalidOperationException("Unsupported or inconsistent payment method.")
        };
    }
}
