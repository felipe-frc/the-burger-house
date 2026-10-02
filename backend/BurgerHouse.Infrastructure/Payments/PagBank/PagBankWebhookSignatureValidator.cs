using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;

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
    private readonly ILogger<PagBankWebhookSignatureValidator>? _logger;

    public PagBankWebhookSignatureValidator(HttpClient httpClient, IOptions<PagBankOptions> options,
        ILogger<PagBankWebhookSignatureValidator>? logger = null)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);
        _httpClient = httpClient;
        _logger = logger;
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
        var signatures = signatureHeaders
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!)
            .SelectMany(value => value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();
        var fingerprint = "unavailable";
        var cachedValidation = "not-attempted";
        var refreshedValidation = "not-attempted";
        var refreshExecuted = false;
        var validatedFormat = "none";
        try
        {
            if (rawBody.IsEmpty || signatures.Length == 0)
            {
                cachedValidation = "failure";
                return false;
            }
            var publicKey = await GetPublicKeyAsync(false, cancellationToken);
            fingerprint = HashPrefix(publicKey);
            var valid = Verify(rawBody, signatures, publicKey, out validatedFormat);
            cachedValidation = valid ? "success" : "failure";
            if (valid) return true;

            refreshExecuted = true;
            publicKey = await GetPublicKeyAsync(true, cancellationToken);
            fingerprint = HashPrefix(publicKey);
            valid = Verify(rawBody, signatures, publicKey, out validatedFormat);
            refreshedValidation = valid ? "success" : "failure";
            return valid;
        }
        finally
        {
            _logger?.LogInformation(
                "PagBank webhook signature validation. bodyLength: {bodyLength}, signatureCount: {signatureCount}, bodySha256Prefix: {bodySha256Prefix}, publicKeyFingerprint: {publicKeyFingerprint}, cacheValidation: {cacheValidation}, refreshExecuted: {refreshExecuted}, refreshValidation: {refreshValidation}, validatedFormat: {validatedFormat}.",
                rawBody.Length, signatures.Length, HashPrefix(rawBody.Span), fingerprint,
                cachedValidation, refreshExecuted, refreshedValidation, validatedFormat);
        }
    }

    private static string HashPrefix(ReadOnlySpan<byte> value) =>
        Convert.ToHexString(SHA256.HashData(value))[..12];

    private static bool Verify(ReadOnlyMemory<byte> rawBody, string[] signatures, byte[] publicKey,
        out string validatedFormat)
    {
        validatedFormat = "none";
        using var ecdsa = ECDsa.Create();
        ecdsa.ImportSubjectPublicKeyInfo(publicKey, out _);
        foreach (var signature in signatures)
        {
            byte[] signatureBytes;
            try
            {
                signatureBytes = Convert.FromBase64String(signature);
            }
            catch (FormatException)
            {
                continue;
            }

            // Try both encodings against the same, unmodified signature and payload.
            if (VerifyFormat(ecdsa, rawBody.Span, signatureBytes, DSASignatureFormat.Rfc3279DerSequence))
            {
                validatedFormat = "DER";
                return true;
            }
            if (VerifyFormat(ecdsa, rawBody.Span, signatureBytes, DSASignatureFormat.IeeeP1363FixedFieldConcatenation))
            {
                validatedFormat = "P1363";
                return true;
            }
        }
        return false;
    }

    private static bool VerifyFormat(ECDsa ecdsa, ReadOnlySpan<byte> rawBody,
        ReadOnlySpan<byte> signature, DSASignatureFormat format)
    {
        try
        {
            return ecdsa.VerifyData(rawBody, signature, HashAlgorithmName.SHA256, format);
        }
        catch (CryptographicException)
        {
            // A malformed encoding must not prevent trying the next format.
            return false;
        }
    }

    private async Task<byte[]> GetPublicKeyAsync(bool forceRefresh, CancellationToken cancellationToken)
    {
        await _cacheLock.WaitAsync(cancellationToken);
        try
        {
            // All cache reads, invalidations and publications share the same lock.
            if (forceRefresh) _cachedPublicKey = null;
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
                var publicKey = Convert.FromBase64String(payload.PublicKey);
                using var ecdsa = ECDsa.Create();
                ecdsa.ImportSubjectPublicKeyInfo(publicKey, out var bytesRead);
                if (bytesRead != publicKey.Length)
                    throw new CryptographicException("Trailing bytes in webhook public key.");
                _cachedPublicKey = publicKey;
            }
            catch (Exception exception) when (exception is JsonException or FormatException or CryptographicException)
            {
                throw new HttpRequestException("PagBank returned an invalid webhook public key.", exception);
            }
            _cacheExpiresAt = DateTime.UtcNow.Add(CacheDuration);
            return _cachedPublicKey;
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new HttpRequestException("PagBank webhook public key request timed out.", exception);
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
