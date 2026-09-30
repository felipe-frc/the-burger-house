using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public static class PagBankPaymentMethodMapper
{
    public static PaymentMethod Map(string? type, string? cardProduct = null)
    {
        var normalizedType = type?.Trim().ToUpperInvariant();
        var normalizedProduct = cardProduct?.Trim().ToUpperInvariant();
        return normalizedType switch
        {
            "PIX" => PaymentMethod.Pix,
            "CREDIT_CARD" when normalizedProduct == "PRE_PAID" => PaymentMethod.PrepaidCard,
            "CREDIT_CARD" => PaymentMethod.CreditCard,
            "DEBIT_CARD" => PaymentMethod.DebitCard,
            _ => PaymentMethod.Unknown
        };
    }
}
