using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PagBankWebhookSignatureValidator
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);
    private readonly HttpClient _httpClient;
    private readonly string _token;
    private readonly Uri _baseUri;
    private readonly SemaphoreSlim _cacheLock = new(1, 1);
    private byte[]? _cachedPublicKey;
    private DateTime _cacheExpiresAt;

    public PagBankWebhookSignatureValidator(HttpClient httpClient, IOptions<PagBankOptions> options)
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

    public async Task<bool> IsValidAsync(
        ReadOnlyMemory<byte> rawBody,
        IEnumerable<string?> signatureHeaders,
        CancellationToken cancellationToken = default)
    {
        if (rawBody.IsEmpty) return false;
        var signatures = signatureHeaders
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!)
            .SelectMany(value => value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();
        if (signatures.Length == 0) return false;

        var publicKey = await GetPublicKeyAsync(cancellationToken);
        using var ecdsa = ECDsa.Create();
        ecdsa.ImportSubjectPublicKeyInfo(publicKey, out _);
        foreach (var signature in signatures)
        {
            try
            {
                if (ecdsa.VerifyData(
                        rawBody.Span,
                        Convert.FromBase64String(signature),
                        HashAlgorithmName.SHA256,
                        DSASignatureFormat.Rfc3279DerSequence))
                    return true;
            }
            catch (FormatException)
            {
                // Invalid Base64 is an invalid signature, not an application failure.
            }
        }
        return false;
    }

    private async Task<byte[]> GetPublicKeyAsync(CancellationToken cancellationToken)
    {
        if (_cachedPublicKey is not null && _cacheExpiresAt > DateTime.UtcNow)
            return _cachedPublicKey;
        await _cacheLock.WaitAsync(cancellationToken);
        try
        {
            if (_cachedPublicKey is not null && _cacheExpiresAt > DateTime.UtcNow)
                return _cachedPublicKey;
            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                new Uri(_baseUri, "public-keys?type=webhook")
            );
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw new HttpRequestException(
                    $"PagBank public key request failed with HTTP {(int)response.StatusCode}.",
                    null,
                    response.StatusCode
                );
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            try
            {
                var payload = await JsonSerializer.DeserializeAsync<PublicKeyResponse>(
                    stream,
                    cancellationToken: cancellationToken
                );
                if (string.IsNullOrWhiteSpace(payload?.PublicKey))
                    throw new JsonException("PagBank returned no webhook public key.");
                _cachedPublicKey = Convert.FromBase64String(payload.PublicKey);
            }
            catch (Exception exception) when (exception is JsonException or FormatException)
            {
                throw new HttpRequestException("PagBank returned an invalid webhook public key.", exception);
            }
            _cacheExpiresAt = DateTime.UtcNow.Add(CacheDuration);
            return _cachedPublicKey;
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    private sealed class PublicKeyResponse
    {
        [JsonPropertyName("public_key")] public string? PublicKey { get; init; }
    }
}
