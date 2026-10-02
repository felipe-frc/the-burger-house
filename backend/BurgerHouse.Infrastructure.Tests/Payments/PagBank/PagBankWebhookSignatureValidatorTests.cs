using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Tests.Payments.PagBank;

public class PagBankWebhookSignatureValidatorTests
{
    [Fact]
    public async Task ValidatesRawPayloadWithOfficialPublicKeyAndCachesIt()
    {
        using var signer = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var publicKey = Convert.ToBase64String(signer.ExportSubjectPublicKeyInfo());
        var calls = 0;
        HttpRequestMessage? captured = null;
        using var http = new HttpClient(new Stub(request =>
        {
            captured = request;
            Interlocked.Increment(ref calls);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new { public_key = publicKey }))
            });
        }));
        var validator = new PagBankWebhookSignatureValidator(http, Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com",
            Token = "local-test-token"
        }));
        var rawBody = Encoding.UTF8.GetBytes("{\"id\":\"CHEC_1\"}");
        var signature = Convert.ToBase64String(signer.SignData(
            rawBody,
            HashAlgorithmName.SHA256,
            DSASignatureFormat.Rfc3279DerSequence));

        Assert.True(await validator.IsValidAsync(rawBody, [signature]));
        Assert.True(await validator.IsValidAsync(rawBody, ["invalid", signature]));

        Assert.Equal(1, calls);
        Assert.Equal("https://sandbox.api.pagseguro.com/public-keys?type=webhook", captured!.RequestUri!.ToString());
        Assert.Equal("Bearer", captured.Headers.Authorization!.Scheme);
        Assert.Equal("local-test-token", captured.Headers.Authorization.Parameter);
    }

    [Fact]
    public async Task RejectsMissingOrInvalidSignature()
    {
        using var signer = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        using var http = new HttpClient(new Stub(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(new
            {
                public_key = Convert.ToBase64String(signer.ExportSubjectPublicKeyInfo())
            }))
        })));
        var validator = new PagBankWebhookSignatureValidator(http, Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com",
            Token = "local-test-token"
        }));
        var rawBody = Encoding.UTF8.GetBytes("{}");

        Assert.False(await validator.IsValidAsync(rawBody, []));
        Assert.False(await validator.IsValidAsync(rawBody, ["not-base64"]));
    }


    [Fact]
    public async Task RefreshesStaleCacheOnceAndRetriesAllSignatures()
    {
        using var oldKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        using var newKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var calls = 0;
        using var http = new HttpClient(new Stub(_ =>
            Task.FromResult(KeyResponse(++calls == 1 ? oldKey : newKey))));
        var validator = Create(http);
        var body = Encoding.UTF8.GetBytes(" {\n \"message\": \"ação\" }\n");
        Assert.True(await validator.IsValidAsync(body, [Sign(oldKey, body)]));
        Assert.True(await validator.IsValidAsync(body, ["invalid", Sign(newKey, body)]));
        Assert.True(await validator.IsValidAsync(body, [Sign(newKey, body)]));
        Assert.Equal(2, calls);
    }

    [Theory]
    [InlineData("wrong-key")]
    [InlineData("base64")]
    [InlineData("der")]
    [InlineData("changed-byte")]
    public async Task RejectsAfterExactlyOneRefresh(string scenario)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        using var other = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var calls = 0;
        using var http = new HttpClient(new Stub(_ =>
        {
            Interlocked.Increment(ref calls);
            return Task.FromResult(KeyResponse(key));
        }));
        var validator = Create(http);
        var body = Encoding.UTF8.GetBytes("{ \"x\": 1 }");
        Assert.True(await validator.IsValidAsync(body, [Sign(key, body)]));
        var signature = scenario switch
        {
            "base64" => "not-base64",
            "der" => Convert.ToBase64String(new byte[] { 0x30, 0x01, 0xff }),
            "wrong-key" => Sign(other, body),
            _ => Sign(key, body)
        };
        if (scenario == "changed-byte") body[7] = (byte)'2';
        Assert.False(await validator.IsValidAsync(body, [signature]));
        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task AcceptsRealDerSignatureFromCombinedHeader()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        using var http = new HttpClient(new Stub(_ => Task.FromResult(KeyResponse(key))));
        var body = Encoding.UTF8.GetBytes("{\r\n  \"x\": 1\r\n}\n");
        var signature = Sign(key, body);
        Assert.Equal(0x30, Convert.FromBase64String(signature)[0]);
        Assert.True(await Create(http).IsValidAsync(body, [$"invalid, {signature}"]));
    }

    [Theory]
    [InlineData(401)]
    [InlineData(403)]
    [InlineData(404)]
    [InlineData(500)]
    public async Task PublicKeyHttpFailuresAreInfrastructureErrors(int status)
    {
        using var http = new HttpClient(new Stub(_ =>
            Task.FromResult(new HttpResponseMessage((HttpStatusCode)status))));
        var error = await Assert.ThrowsAsync<HttpRequestException>(() =>
            Create(http).IsValidAsync(new byte[] { 1 }, ["AA=="]));
        Assert.Equal((HttpStatusCode)status, error.StatusCode);
    }

    [Theory]
    [InlineData("not-json")]
    [InlineData("{}")]
    [InlineData("{\"public_key\":\"not-base64\"}")]
    [InlineData("{\"public_key\":\"AA==\"}")]
    public async Task InvalidPublicKeyIsInfrastructureErrorAndIsNotCached(string payload)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var calls = 0;
        using var http = new HttpClient(new Stub(_ => Task.FromResult(++calls == 1
            ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(payload) }
            : KeyResponse(key))));
        var validator = Create(http);
        var body = new byte[] { 1 };
        await Assert.ThrowsAsync<HttpRequestException>(() => validator.IsValidAsync(body, ["AA=="]));
        Assert.True(await validator.IsValidAsync(body, [Sign(key, body)]));
        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task RejectsNonEcKeyAndTrailingSpkiBytesAsInfrastructureErrors()
    {
        using var rsa = RSA.Create(2048);
        using var ec = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        foreach (var bytes in new[] { rsa.ExportSubjectPublicKeyInfo(), ec.ExportSubjectPublicKeyInfo().Concat(new byte[] { 0 }).ToArray() })
        {
            using var http = new HttpClient(new Stub(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new { public_key = Convert.ToBase64String(bytes) }))
            })));
            await Assert.ThrowsAsync<HttpRequestException>(() =>
                Create(http).IsValidAsync(new byte[] { 1 }, ["AA=="]));
        }
    }

    [Fact]
    public async Task TimeoutIsInfrastructureError()
    {
        using var http = new HttpClient(new Stub(_ => throw new TaskCanceledException("timeout")));
        await Assert.ThrowsAsync<HttpRequestException>(() =>
            Create(http).IsValidAsync(new byte[] { 1 }, ["AA=="]));
    }

    [Fact]
    public async Task CallerCancellationIsPreserved()
    {
        using var cancellation = new CancellationTokenSource();
        using var http = new HttpClient(new Stub(_ =>
        {
            cancellation.Cancel();
            throw new OperationCanceledException(cancellation.Token);
        }));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            Create(http).IsValidAsync(new byte[] { 1 }, ["AA=="], cancellation.Token));
    }

    [Fact]
    public async Task FailedRefreshDoesNotBecomeInvalidSignatureOrRetainOldCache()
    {
        using var oldKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        using var newKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var calls = 0;
        using var http = new HttpClient(new Stub(_ => Task.FromResult(++calls switch
        {
            1 => KeyResponse(oldKey),
            2 => new HttpResponseMessage(HttpStatusCode.InternalServerError),
            _ => KeyResponse(newKey)
        })));
        var validator = Create(http);
        var body = new byte[] { 1 };
        Assert.True(await validator.IsValidAsync(body, [Sign(oldKey, body)]));
        await Assert.ThrowsAsync<HttpRequestException>(() =>
            validator.IsValidAsync(body, [Sign(newKey, body)]));
        Assert.True(await validator.IsValidAsync(body, [Sign(newKey, body)]));
        Assert.Equal(3, calls);
    }

    [Fact]
    public async Task ConcurrentRequestsShareSafelyPublishedKey()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var calls = 0;
        using var http = new HttpClient(new Stub(async _ =>
        {
            Interlocked.Increment(ref calls);
            await Task.Yield();
            return KeyResponse(key);
        }));
        var validator = Create(http);
        var body = new byte[] { 1 };
        var signature = Sign(key, body);
        var results = await Task.WhenAll(Enumerable.Range(0, 20)
            .Select(_ => Task.Run(() => validator.IsValidAsync(body, [signature]))));
        Assert.All(results, value => Assert.True(value));
        Assert.Equal(1, calls);
    }


    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task LogsOnlySafeDiagnostics(bool refresh, bool reject)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        using var other = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var calls = 0;
        using var http = new HttpClient(new Stub(_ => Task.FromResult(
            KeyResponse(++calls == 1 && refresh || reject ? other : key))));
        var logger = new CaptureLogger();
        var validator = new PagBankWebhookSignatureValidator(http, Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com",
            Token = "secret-test-token"
        }), logger);
        var body = Encoding.UTF8.GetBytes("{ \"private\": \"never-log-this\" }");
        var signature = Sign(key, body);
        Assert.Equal(!reject, await validator.IsValidAsync(body, [signature]));
        var entry = Assert.Single(logger.Entries);
        Assert.Null(entry.Exception);
        Assert.Equal(body.Length, entry.Fields["bodyLength"]);
        Assert.Equal(1, entry.Fields["signatureCount"]);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(body))[..12], entry.Fields["bodySha256Prefix"]);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(
            (reject ? other : key).ExportSubjectPublicKeyInfo()))[..12], entry.Fields["publicKeyFingerprint"]);
        Assert.Equal(refresh, entry.Fields["refreshExecuted"]);
        Assert.Equal(refresh ? "failure" : "success", entry.Fields["cacheValidation"]);
        Assert.Equal(refresh ? (reject ? "failure" : "success") : "not-attempted", entry.Fields["refreshValidation"]);
        Assert.Equal(8, entry.Fields.Count); // Seven fields plus the logging template.
        Assert.DoesNotContain(signature, entry.Message);
        Assert.DoesNotContain("secret-test-token", entry.Message);
        Assert.DoesNotContain("never-log-this", entry.Message);
        Assert.DoesNotContain(Convert.ToBase64String(key.ExportSubjectPublicKeyInfo()), entry.Message);
    }

    private sealed class CaptureLogger : Microsoft.Extensions.Logging.ILogger<PagBankWebhookSignatureValidator>
    {
        public List<(Dictionary<string, object?> Fields, string Message, Exception? Exception)> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;
        public void Log<TState>(Microsoft.Extensions.Logging.LogLevel logLevel,
            Microsoft.Extensions.Logging.EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Entries.Add((((IEnumerable<KeyValuePair<string, object?>>)state!).ToDictionary(
                pair => pair.Key, pair => pair.Value), formatter(state, exception), exception));
    }


    private static string Sign(ECDsa key, byte[] body) => Convert.ToBase64String(
        key.SignData(body, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence));

    private static HttpResponseMessage KeyResponse(ECDsa key) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(new
        {
            public_key = Convert.ToBase64String(key.ExportSubjectPublicKeyInfo())
        }))
    };

    private static PagBankWebhookSignatureValidator Create(HttpClient http) => new(http,
        Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com",
            Token = "local-test-token"
        }));


    private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request);
    }
}
