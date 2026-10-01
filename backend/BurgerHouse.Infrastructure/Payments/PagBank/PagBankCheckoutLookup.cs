using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PagBankCheckoutLookup
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;
    private readonly string _token;
    private readonly Uri _baseUri;

    public PagBankCheckoutLookup(HttpClient httpClient, IOptions<PagBankOptions> options)
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

    public async Task<PagBankCheckoutSnapshot?> GetAsync(
        string externalCheckoutId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(externalCheckoutId);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            new Uri(
                _baseUri,
                $"checkouts/{Uri.EscapeDataString(externalCheckoutId.Trim())}?limit=100"
            )
        );
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await _httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken
        );
        if (response.StatusCode == HttpStatusCode.NotFound)
            return null;
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(
                $"PagBank checkout lookup failed with HTTP {(int)response.StatusCode}.",
                null,
                response.StatusCode
            );

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var checkout = await JsonSerializer.DeserializeAsync<PagBankCheckoutResponse>(
            stream,
            JsonOptions,
            cancellationToken
        ) ?? throw new JsonException("PagBank returned an empty checkout response.");

        if (string.IsNullOrWhiteSpace(checkout.Id) ||
            string.IsNullOrWhiteSpace(checkout.ReferenceId))
            throw new InvalidOperationException("PagBank returned an incomplete checkout response.");

        var charges = new List<PagBankPaymentSnapshot>();
        foreach (var charge in checkout.Charges ?? [])
        {
            if (string.IsNullOrWhiteSpace(charge.Id) ||
                string.IsNullOrWhiteSpace(charge.ReferenceId) ||
                string.IsNullOrWhiteSpace(charge.Status) ||
                charge.Amount?.Value is null or <= 0 ||
                string.IsNullOrWhiteSpace(charge.Amount.Currency) ||
                charge.Amount.Summary?.Total is null or <= 0 ||
                charge.Amount.Summary.Refunded is null or < 0)
                throw new InvalidOperationException("PagBank returned an incomplete checkout charge.");
            if (charge.Amount.Value != charge.Amount.Summary.Total)
                throw new InvalidOperationException("PagBank returned inconsistent checkout charge amounts.");

            var status = PagBankPaymentStatusMapper.Map(
                charge.Status,
                charge.Amount.Summary.Total.Value,
                charge.Amount.Summary.Refunded.Value
            );
            var method = PagBankPaymentMethodMapper.Map(
                charge.PaymentMethod?.Type,
                charge.PaymentMethod?.Card?.Product
            );

            charges.Add(new PagBankPaymentSnapshot(
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
            ));
        }

        return new PagBankCheckoutSnapshot(
            checkout.Id.Trim(),
            checkout.ReferenceId.Trim(),
            charges
        );
    }

    private sealed class PagBankCheckoutResponse
    {
        [JsonPropertyName("id")] public string? Id { get; init; }
        [JsonPropertyName("reference_id")] public string? ReferenceId { get; init; }
        [JsonPropertyName("charges")] public PagBankChargeResponse[]? Charges { get; init; }
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

public sealed record PagBankCheckoutSnapshot(
    string Id,
    string ReferenceId,
    IReadOnlyList<PagBankPaymentSnapshot> Charges
);
