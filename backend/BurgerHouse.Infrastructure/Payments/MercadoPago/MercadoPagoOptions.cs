namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoOptions
{
    public const string SectionName = "MercadoPago";

    public string AccessToken { get; init; } = string.Empty;
}