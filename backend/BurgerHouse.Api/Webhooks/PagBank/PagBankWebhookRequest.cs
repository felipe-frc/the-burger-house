using System.Text.Json.Serialization;

namespace BurgerHouse.Api.Webhooks.PagBank;

public sealed class PagBankWebhookRequest
{
    [JsonPropertyName("id")] public string? Id { get; init; }

    [JsonPropertyName("reference_id")] public string? ReferenceId { get; init; }

    [JsonPropertyName("charges")] public PagBankWebhookCharge[]? Charges { get; init; }
}

public sealed class PagBankWebhookCharge
{
    [JsonPropertyName("id")] public string? Id { get; init; }
}
