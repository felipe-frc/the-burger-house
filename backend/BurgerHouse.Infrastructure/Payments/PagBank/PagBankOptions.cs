namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PagBankOptions
{
    public const string SectionName = "PagBank";

    public string BaseUrl { get; init; } = string.Empty;

    public string Token { get; init; } = string.Empty;

    public string RedirectUrl { get; init; } = string.Empty;

    public string NotificationUrl { get; init; } = string.Empty;
}
