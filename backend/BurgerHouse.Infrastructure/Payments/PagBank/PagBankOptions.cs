namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PagBankOptions
{
    public const string SectionName = "PagBank";
    public const string SandboxOrigin = "https://sandbox.api.pagseguro.com";
    public const string LocalHomologationReturnUrl = "https://localhost:4174/menu";
    public const string LocalPortfolioReturnUrl = "https://127.0.0.1:55485/menu";
    public bool EnablePortfolioSandbox { get; init; }

    public string BaseUrl { get; init; } = string.Empty;

    public bool AllowUnsignedSandboxWebhooks { get; init; } = false;

    public string Token { get; init; } = string.Empty;

    public string RedirectUrl { get; init; } = string.Empty;

    public string NotificationUrl { get; init; } = string.Empty;

    public int CheckoutExpirationMinutes { get; init; } = 30;
}
