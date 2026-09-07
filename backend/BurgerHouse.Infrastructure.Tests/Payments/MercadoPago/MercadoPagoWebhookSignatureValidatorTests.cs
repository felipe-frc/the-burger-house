using System.Security.Cryptography;
using System.Text;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Tests.Payments.MercadoPago;

public class MercadoPagoWebhookSignatureValidatorTests
{
    private const string Secret =
        "local-test-webhook-secret";

    [Fact]
    public void Constructor_ShouldThrow_WhenWebhookSecretIsEmpty()
    {
        var options = Options.Create(
            new MercadoPagoOptions
            {
                WebhookSecret = ""
            }
        );

        Assert.Throws<InvalidOperationException>(
            () => new MercadoPagoWebhookSignatureValidator(
                options
            )
        );
    }

    [Theory]
    [InlineData(null, "request-123", "order-456")]
    [InlineData("signature", null, "order-456")]
    [InlineData("signature", "request-123", null)]
    public void IsValid_ShouldReturnFalse_WhenRequiredDataIsMissing(
        string? xSignature,
        string? xRequestId,
        string? dataId)
    {
        var validator = CreateValidator();

        var result = validator.IsValid(
            xSignature,
            xRequestId,
            dataId
        );

        Assert.False(result);
    }

    [Fact]
    public void IsValid_ShouldReturnFalse_WhenSignatureIsInvalid()
    {
        var validator = CreateValidator();

        var result = validator.IsValid(
            xSignature:
                "ts=1700000000,v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

            xRequestId:
                "request-123",

            dataId:
                "order-456"
        );

        Assert.False(result);
    }

    [Fact]
    public void IsValid_ShouldReturnTrue_WhenSignatureIsValid()
    {
        const string requestId =
            "request-123";

        const string dataId =
            "order-456";

        var timestamp =
            DateTimeOffset.UtcNow
                .ToUnixTimeSeconds()
                .ToString();

        var manifest =
            $"id:{dataId};" +
            $"request-id:{requestId};" +
            $"ts:{timestamp};";

        var hash = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(Secret),
            Encoding.UTF8.GetBytes(manifest)
        );

        var signature =
            Convert.ToHexString(hash)
                .ToLowerInvariant();

        var xSignature =
            $"ts={timestamp},v1={signature}";

        var validator = CreateValidator();

        var result = validator.IsValid(
            xSignature,
            requestId,
            dataId
        );

        Assert.True(result);
    }

    private static MercadoPagoWebhookSignatureValidator
        CreateValidator()
    {
        var options = Options.Create(
            new MercadoPagoOptions
            {
                WebhookSecret = Secret
            }
        );

        return new MercadoPagoWebhookSignatureValidator(
            options
        );
    }
}