using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PagBankCheckoutService : IHostedCheckoutGateway
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;
    private readonly PagBankOptions _options;
    private readonly Uri _baseUri;

    public PagBankCheckoutService(HttpClient httpClient, IOptions<PagBankOptions> options)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);
        _httpClient = httpClient;
        _options = options.Value;
        _baseUri = ValidateBaseUrl(_options.BaseUrl);
        if (string.IsNullOrWhiteSpace(_options.Token))
            throw new InvalidOperationException("PagBank token was not configured.");
        ValidatePublicUrl(_options.RedirectUrl, "redirect");
        ValidatePublicUrl(_options.NotificationUrl, "notification");
    }

    public PaymentProvider Provider => PaymentProvider.PagBank;

    public async Task<HostedCheckoutSession> GetOrCreateAsync(
        Payment payment,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(payment);
        if (payment.Id <= 0)
            throw new InvalidOperationException("Payment must be persisted before creating checkout.");
        if (payment.Provider != PaymentProvider.PagBank)
            throw new InvalidOperationException("Payment does not belong to PagBank.");

        var reference = CreateReference(payment.Id);
        PagBankCheckoutResponse checkout;

        if (payment.ExternalCheckoutId is not null)
        {
            using var request = CreateRequest(
                HttpMethod.Get,
                $"checkouts/{Uri.EscapeDataString(payment.ExternalCheckoutId)}"
            );
            checkout = await SendAsync(request, cancellationToken);
        }
        else
        {
            var unitAmount = ToCents(payment.Amount);
            var payload = new PagBankCheckoutRequest(
                reference,
                [new PagBankCheckoutItem($"order:{payment.OrderId}", $"Pedido The Burger House #{payment.OrderId}", 1, unitAmount)],
                _options.RedirectUrl,
                _options.RedirectUrl,
                [_options.NotificationUrl],
                [_options.NotificationUrl]
            );
            using var request = CreateRequest(HttpMethod.Post, "checkouts");
            request.Content = JsonContent.Create(payload, options: JsonOptions);
            checkout = await SendAsync(request, cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(checkout.Id) ||
            !string.Equals(checkout.ReferenceId, reference, StringComparison.Ordinal))
            throw new InvalidOperationException("PagBank returned an incompatible checkout.");
        if (!string.Equals(checkout.Status, "ACTIVE", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("PagBank checkout is not active.");

        var payLinks = checkout.Links?
            .Where(link => string.Equals(link.Rel, "PAY", StringComparison.OrdinalIgnoreCase))
            .ToArray() ?? [];
        if (payLinks.Length != 1 || !IsCheckoutUrl(payLinks[0].Href))
            throw new InvalidOperationException("PagBank returned no valid PAY link.");

        payment.SetExternalCheckoutId(checkout.Id);
        return new HostedCheckoutSession(payment.Id, checkout.Id, payLinks[0].Href!);
    }

    public static string CreateReference(int paymentId) => $"payment:{paymentId}";

    public static bool IsCheckoutUrl(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps &&
        string.IsNullOrEmpty(uri.UserInfo) &&
        uri.Host is "pagamento.pagbank.com.br"
            or "pagamento.sandbox.pagbank.com.br"
            or "sandbox.pagseguro.uol.com.br"
            or "pagseguro.uol.com.br";

    private HttpRequestMessage CreateRequest(HttpMethod method, string relativePath)
    {
        var request = new HttpRequestMessage(method, new Uri(_baseUri, relativePath));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.Token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return request;
    }

    private async Task<PagBankCheckoutResponse> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        using var response = await _httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken
        );
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException(
                $"PagBank checkout request failed with HTTP {(int)response.StatusCode}.",
                null,
                response.StatusCode
            );
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonSerializer.DeserializeAsync<PagBankCheckoutResponse>(
                   stream,
                   JsonOptions,
                   cancellationToken
               ) ?? throw new JsonException("PagBank returned an empty checkout response.");
    }

    private static int ToCents(decimal amount)
    {
        var cents = amount * 100m;
        if (cents <= 0 || cents != decimal.Truncate(cents) || cents > int.MaxValue)
            throw new InvalidOperationException("Payment amount cannot be represented in cents.");
        return checked((int)cents);
    }

    private static Uri ValidateBaseUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
            throw new InvalidOperationException("PagBank base URL must be an HTTPS URL.");
        return new Uri(uri.ToString().TrimEnd('/') + "/");
    }

    private static void ValidatePublicUrl(string value, string name)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            uri.IsLoopback ||
            !string.IsNullOrEmpty(uri.UserInfo))
            throw new InvalidOperationException($"PagBank {name} URL must be a public HTTPS URL.");
    }

    private sealed record PagBankCheckoutRequest(
        [property: JsonPropertyName("reference_id")] string ReferenceId,
        [property: JsonPropertyName("items")] PagBankCheckoutItem[] Items,
        [property: JsonPropertyName("redirect_url")] string RedirectUrl,
        [property: JsonPropertyName("return_url")] string ReturnUrl,
        [property: JsonPropertyName("notification_urls")] string[] NotificationUrls,
        [property: JsonPropertyName("payment_notification_urls")] string[] PaymentNotificationUrls
    );

    private sealed record PagBankCheckoutItem(
        [property: JsonPropertyName("reference_id")] string ReferenceId,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("quantity")] int Quantity,
        [property: JsonPropertyName("unit_amount")] int UnitAmount
    );

    private sealed class PagBankCheckoutResponse
    {
        [JsonPropertyName("id")] public string? Id { get; init; }
        [JsonPropertyName("reference_id")] public string? ReferenceId { get; init; }
        [JsonPropertyName("status")] public string? Status { get; init; }
        [JsonPropertyName("links")] public PagBankLink[]? Links { get; init; }
    }

    private sealed class PagBankLink
    {
        [JsonPropertyName("rel")] public string? Rel { get; init; }
        [JsonPropertyName("href")] public string? Href { get; init; }
    }
}
