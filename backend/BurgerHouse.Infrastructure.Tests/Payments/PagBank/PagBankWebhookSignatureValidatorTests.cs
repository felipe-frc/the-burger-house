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

    private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request);
    }
}
