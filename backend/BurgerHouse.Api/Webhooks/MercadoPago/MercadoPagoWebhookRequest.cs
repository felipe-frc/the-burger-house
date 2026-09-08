using System.Text.Json;
using System.Text.Json.Serialization;

namespace BurgerHouse.Api.Webhooks.MercadoPago;

public sealed class MercadoPagoWebhookRequest
{
    [JsonPropertyName("id")]
    public JsonElement Id { get; init; }

    [JsonPropertyName("type")]
    public string Type { get; init; } = string.Empty;

    [JsonPropertyName("action")]
    public string Action { get; init; } = string.Empty;

    [JsonPropertyName("application_id")]
    public JsonElement ApplicationId { get; init; }

    [JsonPropertyName("data")]
    public MercadoPagoWebhookData Data { get; init; } = new();
}

public sealed class MercadoPagoWebhookData
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;
}