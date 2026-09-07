using System.Text.Json.Serialization;

namespace BurgerHouse.Api.Webhooks.MercadoPago;

public sealed class MercadoPagoWebhookRequest
{
    [JsonPropertyName("type")]
    public string Type { get; init; } = string.Empty;

    [JsonPropertyName("action")]
    public string Action { get; init; } = string.Empty;

    [JsonPropertyName("data")]
    public MercadoPagoWebhookData Data { get; init; } = new();
}

public sealed class MercadoPagoWebhookData
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;
}