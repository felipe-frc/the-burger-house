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

    [JsonPropertyName("reference_id")] public string? ReferenceId { get; init; }

    [JsonPropertyName("status")] public string? Status { get; init; }

    [JsonPropertyName("amount")] public PagBankWebhookAmount? Amount { get; init; }

    [JsonPropertyName("payment_method")] public PagBankWebhookPaymentMethod? PaymentMethod { get; init; }
}

public sealed class PagBankWebhookAmount
{
    [JsonPropertyName("value")] public int? Value { get; init; }

    [JsonPropertyName("currency")] public string? Currency { get; init; }

    [JsonPropertyName("summary")] public PagBankWebhookAmountSummary? Summary { get; init; }
}

public sealed class PagBankWebhookAmountSummary
{
    [JsonPropertyName("total")] public int? Total { get; init; }

    [JsonPropertyName("refunded")] public int? Refunded { get; init; }
}

public sealed class PagBankWebhookPaymentMethod
{
    [JsonPropertyName("type")] public string? Type { get; init; }

    [JsonPropertyName("card")] public PagBankWebhookCard? Card { get; init; }
}

public sealed class PagBankWebhookCard
{
    [JsonPropertyName("product")] public string? Product { get; init; }
}
