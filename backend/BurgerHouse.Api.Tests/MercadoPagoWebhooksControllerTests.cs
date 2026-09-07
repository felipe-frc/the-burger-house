using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BurgerHouse.Api.Controllers;
using BurgerHouse.Api.Webhooks.MercadoPago;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Tests;

public class MercadoPagoWebhooksControllerTests
{
    private const string Secret =
        "local-controller-test-secret";

    [Fact]
    public void Receive_ShouldReturnUnauthorized_WhenSignatureIsInvalid()
    {
        var controller = CreateController();

        controller.Request.Headers["x-signature"] =
            "ts=1700000000,v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        controller.Request.Headers["x-request-id"] =
            "request-123";

        var request = new MercadoPagoWebhookRequest
        {
            Type = "order",
            Action = "updated",
            Data = new MercadoPagoWebhookData
            {
                Id = "order-456"
            }
        };

        var result = controller.Receive(request);

        Assert.IsType<UnauthorizedObjectResult>(
            result
        );
    }

    [Fact]
    public void Receive_ShouldReturnOk_WhenOrderSignatureIsValid()
    {
        const string requestId =
            "request-123";

        const string dataId =
            "order-456";

        var controller = CreateController();

        controller.Request.Headers["x-signature"] =
            CreateValidSignature(
                requestId,
                dataId
            );

        controller.Request.Headers["x-request-id"] =
            requestId;

        var request = new MercadoPagoWebhookRequest
        {
            Type = "order",
            Action = "updated",
            Data = new MercadoPagoWebhookData
            {
                Id = dataId
            }
        };

        var result = controller.Receive(request);

        var okResult =
            Assert.IsType<OkObjectResult>(result);

        var json =
            JsonSerializer.SerializeToElement(
                okResult.Value
            );

        Assert.True(
            json.GetProperty("received").GetBoolean()
        );

        Assert.False(
            json.TryGetProperty("ignored", out _)
        );
    }

    [Fact]
    public void Receive_ShouldIgnoreValidWebhook_WhenTypeIsNotOrder()
    {
        const string requestId =
            "request-123";

        const string dataId =
            "payment-456";

        var controller = CreateController();

        controller.Request.Headers["x-signature"] =
            CreateValidSignature(
                requestId,
                dataId
            );

        controller.Request.Headers["x-request-id"] =
            requestId;

        var request = new MercadoPagoWebhookRequest
        {
            Type = "payment",
            Action = "updated",
            Data = new MercadoPagoWebhookData
            {
                Id = dataId
            }
        };

        var result = controller.Receive(request);

        var okResult =
            Assert.IsType<OkObjectResult>(result);

        var json =
            JsonSerializer.SerializeToElement(
                okResult.Value
            );

        Assert.True(
            json.GetProperty("received").GetBoolean()
        );

        Assert.True(
            json.GetProperty("ignored").GetBoolean()
        );
    }

    private static MercadoPagoWebhooksController
        CreateController()
    {
        var options = Options.Create(
            new MercadoPagoOptions
            {
                WebhookSecret = Secret
            }
        );

        var validator =
            new MercadoPagoWebhookSignatureValidator(
                options
            );

        var controller =
            new MercadoPagoWebhooksController(
                validator
            );

        controller.ControllerContext =
            new ControllerContext
            {
                HttpContext =
                    new DefaultHttpContext()
            };

        return controller;
    }

    private static string CreateValidSignature(
        string requestId,
        string dataId)
    {
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

        return $"ts={timestamp},v1={signature}";
    }
}