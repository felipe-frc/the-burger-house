using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Enums;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PagBankPaymentLookup
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;
    private readonly string _token;
    private readonly Uri _baseUri;

    public PagBankPaymentLookup(HttpClient httpClient, IOptions<PagBankOptions> options)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);
        _httpClient = httpClient;
        _token = options.Value.Token;
        if (string.IsNullOrWhiteSpace(_token))
            throw new InvalidOperationException("PagBank token was not configured.");
        if (!Uri.TryCreate(options.Value.BaseUrl, UriKind.Absolute, out var baseUri) ||
            baseUri.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(baseUri.UserInfo))
            throw new InvalidOperationException("PagBank base URL must be an HTTPS URL.");
        _baseUri = new Uri(baseUri.ToString().TrimEnd('/') + "/");
    }

    public async Task<PagBankPaymentSnapshot?> GetAsync(
        string externalPaymentId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(externalPaymentId);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            new Uri(_baseUri, $"charges/{Uri.EscapeDataString(externalPaymentId.Trim())}")
        );
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));
        using var response = await _httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken
        );
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(
                $"PagBank payment lookup failed with HTTP {(int)response.StatusCode}.",
                null,
                response.StatusCode
            );

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var charge = await JsonSerializer.DeserializeAsync<PagBankChargeResponse>(
            stream,
            JsonOptions,
            cancellationToken
        ) ?? throw new JsonException("PagBank returned an empty payment response.");

        if (string.IsNullOrWhiteSpace(charge.Id) ||
            string.IsNullOrWhiteSpace(charge.ReferenceId) ||
            string.IsNullOrWhiteSpace(charge.Status) ||
            charge.Amount?.Value is null or <= 0 ||
            string.IsNullOrWhiteSpace(charge.Amount.Currency) ||
            charge.Amount.Summary?.Total is null or <= 0 ||
            charge.Amount.Summary.Refunded is null or < 0)
            throw new InvalidOperationException("PagBank returned an incomplete payment response.");
        if (charge.Amount.Value != charge.Amount.Summary.Total)
            throw new InvalidOperationException("PagBank returned inconsistent payment amounts.");

        var status = PagBankPaymentStatusMapper.Map(
            charge.Status,
            charge.Amount.Summary.Total.Value,
            charge.Amount.Summary.Refunded.Value
        );
        var method = PagBankPaymentMethodMapper.Map(
            charge.PaymentMethod?.Type,
            charge.PaymentMethod?.Card?.Product
        );

        return new PagBankPaymentSnapshot(
            charge.Id.Trim(),
            charge.ReferenceId.Trim(),
            status,
            charge.Status.Trim(),
            method,
            charge.PaymentMethod?.Type?.Trim(),
            charge.Amount.Value.Value / 100m,
            charge.Amount.Currency.Trim(),
            charge.Amount.Summary.Total.Value,
            charge.Amount.Summary.Refunded.Value
        );
    }

    public async Task<PagBankChargeDiscovery> DiscoverChargeAsync(
        string checkoutId, int paymentId, decimal amount, CancellationToken cancellationToken = default)
    {
        if (!IsResourceId(checkoutId, "CHEC_"))
            return new(null, false, 0, "invalid-checkout-id");

        // Only the checkout.orders and order.charges structures captured from the API
        // are supported. Never follow provider links (including internal hosts).
        var checkout = await GetResourceAsync<CheckoutResponse>(
            $"checkouts/{Uri.EscapeDataString(checkoutId)}?offset=0&limit=100", cancellationToken);
        if (checkout is null) return new(null, false, 0, "checkout-not-found");
        var reference = PagBankCheckoutService.CreateReference(paymentId);
        if (checkout.Id != checkoutId || checkout.ReferenceId != reference)
            return new(null, true, 0, "checkout-correlation-mismatch");
        // Requiring one order also rejects a full/truncated page; never select a
        // single result from a potentially ambiguous collection or unknown schema.
        if (checkout.Orders is not { Length: 1 } ||
            !IsResourceId(checkout.Orders[0]?.Id, "ORDE_"))
            return new(null, true, 0, "missing-or-ambiguous-orders");

        var orderId = checkout.Orders[0]!.Id!;
        var order = await GetResourceAsync<OrderResponse>(
            $"orders/{Uri.EscapeDataString(orderId)}", cancellationToken);
        if (order is null || order.Id != orderId || order.ReferenceId != reference)
            return new(null, true, 0, "order-correlation-mismatch");
        if (order.Charges is null)
            return new(null, true, 0, "unrecognized-charge-collection");
        var candidates = order.Charges.Where(charge =>
            charge is not null && IsResourceId(charge.Id, "CHAR_") &&
            charge.ReferenceId == reference && charge.Amount?.Currency == "BRL" &&
            charge.Amount.Value > 0 && charge.Amount.Value / 100m == amount).ToArray();
        return candidates.Length == 1
            ? new(candidates[0]!.Id, true, 1, "selected")
            : new(null, true, candidates.Length, "missing-or-ambiguous-charges");
    }

    private async Task<T?> GetResourceAsync<T>(string path, CancellationToken ct) where T : class
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(_baseUri, path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));
        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"PagBank discovery failed with HTTP {(int)response.StatusCode}.", null, response.StatusCode);
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        return await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions, ct)
            ?? throw new JsonException("PagBank returned an empty discovery response.");
    }

    private static bool IsResourceId(string? id, string prefix) =>
        id is not null && id.StartsWith(prefix, StringComparison.Ordinal) && id.Length > prefix.Length &&
        id[prefix.Length..].All(c => char.IsAsciiLetterOrDigit(c) || c == '-');

    private sealed class CheckoutResponse
    {
        [JsonPropertyName("id")] public string? Id { get; init; }
        [JsonPropertyName("reference_id")] public string? ReferenceId { get; init; }
        [JsonPropertyName("orders")] public OrderResponse?[]? Orders { get; init; }
    }

    private sealed class OrderResponse
    {
        [JsonPropertyName("id")] public string? Id { get; init; }
        [JsonPropertyName("reference_id")] public string? ReferenceId { get; init; }
        [JsonPropertyName("charges")] public PagBankChargeResponse?[]? Charges { get; init; }
    }

    private sealed class PagBankChargeResponse
    {
        [JsonPropertyName("id")] public string? Id { get; init; }
        [JsonPropertyName("reference_id")] public string? ReferenceId { get; init; }
        [JsonPropertyName("status")] public string? Status { get; init; }
        [JsonPropertyName("amount")] public PagBankAmount? Amount { get; init; }
        [JsonPropertyName("payment_method")] public PagBankMethod? PaymentMethod { get; init; }
    }

    private sealed class PagBankAmount
    {
        [JsonPropertyName("value")] public int? Value { get; init; }
        [JsonPropertyName("currency")] public string? Currency { get; init; }
        [JsonPropertyName("summary")] public PagBankSummary? Summary { get; init; }
    }

    private sealed class PagBankSummary
    {
        [JsonPropertyName("total")] public int? Total { get; init; }
        [JsonPropertyName("refunded")] public int? Refunded { get; init; }
    }

    private sealed class PagBankMethod
    {
        [JsonPropertyName("type")] public string? Type { get; init; }
        [JsonPropertyName("card")] public PagBankCard? Card { get; init; }
    }

    private sealed class PagBankCard
    {
        [JsonPropertyName("product")] public string? Product { get; init; }
    }
}

public sealed record PagBankPaymentSnapshot(
    string Id,
    string ReferenceId,
    PaymentGatewayStatus PaymentStatus,
    string ProviderStatus,
    PaymentMethod PaymentMethod,
    string? ProviderPaymentMethod,
    decimal Amount,
    string Currency,
    int TotalAmountInCents,
    int RefundedAmountInCents
);

public sealed record PagBankChargeDiscovery(string? ChargeId, bool CheckoutFound, int Candidates, string Reason);
