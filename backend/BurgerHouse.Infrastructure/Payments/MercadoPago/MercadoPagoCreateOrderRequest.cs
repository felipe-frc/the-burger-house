using System.Text.Json.Serialization;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

internal sealed class MercadoPagoCreateOrderRequest
{
    [JsonPropertyName("type")]
    public string Type { get; init; } =
        "online";

    [JsonPropertyName("processing_mode")]
    public string ProcessingMode { get; init; } =
        "automatic";

    [JsonPropertyName("total_amount")]
    public string TotalAmount { get; init; } =
        string.Empty;

    [JsonPropertyName("external_reference")]
    public string ExternalReference { get; init; } =
        string.Empty;

    [JsonPropertyName("payer")]
    public MercadoPagoPayerRequest Payer { get; init; } =
        new();

    [JsonPropertyName("transactions")]
    public MercadoPagoTransactionsRequest Transactions
    {
        get;
        init;
    } = new();
}

internal sealed class MercadoPagoPayerRequest
{
    [JsonPropertyName("email")]
    public string Email { get; init; } =
        string.Empty;
}

internal sealed class MercadoPagoTransactionsRequest
{
    [JsonPropertyName("payments")]
    public List<MercadoPagoPaymentRequest> Payments
    {
        get;
        init;
    } = [];
}

internal sealed class MercadoPagoPaymentRequest
{
    [JsonPropertyName("amount")]
    public string Amount { get; init; } =
        string.Empty;

    [JsonPropertyName("payment_method")]
    public MercadoPagoPaymentMethodRequest PaymentMethod
    {
        get;
        init;
    } = new();
}

internal sealed class MercadoPagoPaymentMethodRequest
{
    [JsonPropertyName("id")]
    public string Id { get; init; } =
        string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; init; } =
        string.Empty;

    [JsonPropertyName("token")]
    [JsonIgnore(
        Condition = JsonIgnoreCondition.WhenWritingNull
    )]
    public string? Token { get; init; }

    [JsonPropertyName("installments")]
    [JsonIgnore(
        Condition = JsonIgnoreCondition.WhenWritingNull
    )]
    public int? Installments { get; init; }
}