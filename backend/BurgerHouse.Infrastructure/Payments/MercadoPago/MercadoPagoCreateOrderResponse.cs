using System.Text.Json.Serialization;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

internal sealed class MercadoPagoCreateOrderResponse
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; init; } = string.Empty;

    [JsonPropertyName("status_detail")]
    public string? StatusDetail { get; init; }

    [JsonPropertyName("transactions")]
    public MercadoPagoTransactionsResponse Transactions { get; init; } = new();
}

internal sealed class MercadoPagoTransactionsResponse
{
    [JsonPropertyName("payments")]
    public List<MercadoPagoPaymentResponse> Payments { get; init; } = [];
}

internal sealed class MercadoPagoPaymentResponse
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; init; } = string.Empty;

    [JsonPropertyName("status_detail")]
    public string? StatusDetail { get; init; }
}