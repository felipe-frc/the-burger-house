using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

using BurgerHouse.Api.Controllers;
using BurgerHouse.Api.Webhooks.MercadoPago;
using BurgerHouse.Infrastructure.Payments.MercadoPago;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Tests;

public class MercadoPagoWebhooksControllerTests
{
    private const string Secret =
        "local-controller-test-secret";

    private const string AccessToken =
        "local-controller-test-access-token";

    [Fact]
    public async Task Receive_ShouldReturnUnauthorized_WhenSignatureIsInvalid()
    {
        var controller = CreateController(
            dataId: "order-456",
            type: "order"
        );

        controller.Request.Headers["x-signature"] =
            "ts=1700000000,v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        controller.Request.Headers["x-request-id"] =
            "request-123";

        var request = CreateWebhookRequest(
            type: "order",
            dataId: "order-456"
        );

        var result = await controller.Receive(
            request,
            CancellationToken.None
        );

        Assert.IsType<UnauthorizedObjectResult>(
            result
        );
    }

    [Fact]
    public async Task Receive_ShouldReturnOk_WhenOrderSignatureIsValid()
    {
        const string requestId =
            "request-123";

        const string dataId =
            "order-456";

        var controller = CreateController(
            dataId,
            type: "order"
        );

        controller.Request.Headers["x-signature"] =
            CreateValidSignature(
                requestId,
                dataId
            );

        controller.Request.Headers["x-request-id"] =
            requestId;

        var request = CreateWebhookRequest(
            type: "order",
            dataId: dataId
        );

        var result = await controller.Receive(
            request,
            CancellationToken.None
        );

        var okResult =
            Assert.IsType<OkObjectResult>(
                result
            );

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
    public async Task Receive_ShouldIgnoreValidWebhook_WhenTypeIsNotOrder()
    {
        const string requestId =
            "request-123";

        const string dataId =
            "payment-456";

        var controller = CreateController(
            dataId,
            type: "payment"
        );

        controller.Request.Headers["x-signature"] =
            CreateValidSignature(
                requestId,
                dataId
            );

        controller.Request.Headers["x-request-id"] =
            requestId;

        var request = CreateWebhookRequest(
            type: "payment",
            dataId: dataId
        );

        var result = await controller.Receive(
            request,
            CancellationToken.None
        );

        var okResult =
            Assert.IsType<OkObjectResult>(
                result
            );

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

    [Fact]
    public async Task Receive_ShouldReturnBadRequest_WhenQueryAndBodyDataIdsDiffer()
    {
        const string requestId =
            "request-123";

        const string signedDataId =
            "order-456";

        var controller = CreateController(
            signedDataId,
            type: "order"
        );

        controller.Request.Headers["x-signature"] =
            CreateValidSignature(
                requestId,
                signedDataId
            );

        controller.Request.Headers["x-request-id"] =
            requestId;

        var request = CreateWebhookRequest(
            type: "order",
            dataId: "different-order-999"
        );

        var result = await controller.Receive(
            request,
            CancellationToken.None
        );

        Assert.IsType<BadRequestObjectResult>(
            result
        );
    }

    private static MercadoPagoWebhooksController CreateController(
        string dataId,
        string type)
    {
        var options = Options.Create(
            new MercadoPagoOptions
            {
                WebhookSecret = Secret,
                AccessToken = AccessToken
            }
        );

        var validator =
            new MercadoPagoWebhookSignatureValidator(
                options
            );

        var orderLookup =
            new MercadoPagoOrderLookup(
                new HttpClient(),
                options
            );

        var environment =
            new TestWebHostEnvironment
            {
                EnvironmentName =
                    Environments.Production
            };

        var logger =
            NullLogger<MercadoPagoWebhooksController>.Instance;

        var controller =
            new MercadoPagoWebhooksController(
                validator,
                orderLookup,
                environment,
                logger
            );

        var httpContext =
            new DefaultHttpContext();

        httpContext.Request.QueryString =
            new QueryString(
                $"?data.id={Uri.EscapeDataString(dataId)}" +
                $"&type={Uri.EscapeDataString(type)}"
            );

        controller.ControllerContext =
            new ControllerContext
            {
                HttpContext = httpContext
            };

        return controller;
    }

    private static MercadoPagoWebhookRequest CreateWebhookRequest(
        string type,
        string dataId)
    {
        return new MercadoPagoWebhookRequest
        {
            Type = type,
            Action = "updated",
            Data = new MercadoPagoWebhookData
            {
                Id = dataId
            }
        };
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

    private sealed class TestWebHostEnvironment
        : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } =
            "BurgerHouse.Api.Tests";

        public IFileProvider WebRootFileProvider { get; set; } =
            new NullFileProvider();

        public string WebRootPath { get; set; } =
            string.Empty;

        public string EnvironmentName { get; set; } =
            Environments.Production;

        public string ContentRootPath { get; set; } =
            string.Empty;

        public IFileProvider ContentRootFileProvider { get; set; } =
            new NullFileProvider();
    }
}