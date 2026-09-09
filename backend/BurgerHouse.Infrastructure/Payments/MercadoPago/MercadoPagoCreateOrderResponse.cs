using System.Text.Json.Serialization;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

internal sealed class MercadoPagoCreateOrderResponse
{
    [JsonPropertyName("id")]
    public string Id { get; init; } =
        string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; init; } =
        string.Empty;

    [JsonPropertyName("status_detail")]
    public string? StatusDetail { get; init; }

    [JsonPropertyName("transactions")]
    public MercadoPagoTransactionsResponse Transactions
    {
        get;
        init;
    } = new();
}

internal sealed class MercadoPagoTransactionsResponse
{
    [JsonPropertyName("payments")]
    public List<MercadoPagoPaymentResponse> Payments
    {
        get;
        init;
    } = [];
}

internal sealed class MercadoPagoPaymentResponse
{
    [JsonPropertyName("id")]
    public string Id { get; init; } =
        string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; init; } =
        string.Empty;

    [JsonPropertyName("status_detail")]
    public string? StatusDetail { get; init; }

    [JsonPropertyName("payment_method")]
    public MercadoPagoPaymentMethodResponse? PaymentMethod
    {
        get;
        init;
    }
}

internal sealed class MercadoPagoPaymentMethodResponse
{
    [JsonPropertyName("id")]
    public string? Id { get; init; }

    [JsonPropertyName("type")]
    public string? Type { get; init; }

    [JsonPropertyName("ticket_url")]
    public string? TicketUrl { get; init; }

    [JsonPropertyName("qr_code")]
    public string? QrCode { get; init; }

    [JsonPropertyName("qr_code_base64")]
    public string? QrCodeBase64 { get; init; }
}