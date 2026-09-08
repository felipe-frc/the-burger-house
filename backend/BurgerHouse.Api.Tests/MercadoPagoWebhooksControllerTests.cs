using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

using BurgerHouse.Api.Controllers;
using BurgerHouse.Api.Webhooks.MercadoPago;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.SynchronizePaymentStatus;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
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

    private const string IdempotencyKey =
        "11111111-1111-4111-8111-111111111111";

    [Fact]
    public async Task Receive_ShouldReturnUnauthorized_WhenSignatureIsInvalid()
    {
        var controller = CreateController(
            dataId: "order-456",
            type: "order",
            environmentName: Environments.Production
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
    public async Task Receive_ShouldSynchronizePayment_WhenOrderSignatureIsValid()
    {
        const string requestId =
            "request-123";

        const string dataId =
            "order-456";

        var payment =
            CreatePendingPayment(dataId);

        var repository =
            new FakePaymentRepository(payment);

        var controller = CreateController(
            dataId,
            type: "order",
            repository: repository,
            orderJson: CreateApprovedOrderJson(dataId)
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

        Assert.True(
            json.GetProperty("synchronized").GetBoolean()
        );

        Assert.Equal(
            PaymentStatus.Approved,
            payment.Status
        );

        Assert.Equal(
            1,
            repository.SaveChangesCount
        );
    }

    [Fact]
    public async Task Receive_ShouldUseSandboxFallbackAndSynchronize_WhenSignatureIsInvalidInDevelopment()
    {
        const string dataId =
            "order-456";

        var payment =
            CreatePendingPayment(dataId);

        var repository =
            new FakePaymentRepository(payment);

        var controller = CreateController(
            dataId,
            type: "order",
            repository: repository,
            orderJson: CreateApprovedOrderJson(dataId),
            environmentName: Environments.Development
        );

        controller.Request.Headers["x-signature"] =
            "ts=1700000000,v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        controller.Request.Headers["x-request-id"] =
            "request-123";

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

        Assert.True(
            json.GetProperty("synchronized").GetBoolean()
        );

        Assert.True(
            json.GetProperty("sandboxFallback").GetBoolean()
        );

        Assert.Equal(
            "mercado-pago-orders-api",
            json.GetProperty("verifiedBy").GetString()
        );

        Assert.Equal(
            PaymentStatus.Approved,
            payment.Status
        );

        Assert.Equal(
            1,
            repository.SaveChangesCount
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
        string type,
        FakePaymentRepository? repository = null,
        string? orderJson = null,
        string environmentName = "Production")
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

        var messageHandler =
            new FakeHttpMessageHandler(
                orderJson
            );

        var orderLookup =
            new MercadoPagoOrderLookup(
                new HttpClient(messageHandler),
                options
            );

        repository ??=
            new FakePaymentRepository();

        var synchronizePaymentStatusHandler =
            new SynchronizePaymentStatusHandler(
                repository
            );

        var environment =
            new TestWebHostEnvironment
            {
                EnvironmentName =
                    environmentName
            };

        var logger =
            NullLogger<MercadoPagoWebhooksController>.Instance;

        var controller =
            new MercadoPagoWebhooksController(
                validator,
                orderLookup,
                synchronizePaymentStatusHandler,
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

    private static Payment CreatePendingPayment(
        string externalOrderId)
    {
        var payment = new Payment(
            orderId: 25,
            amount: 87.80m,
            idempotencyKey: IdempotencyKey
        );

        payment.SetExternalOrderId(
            externalOrderId
        );

        return payment;
    }

    private static string CreateApprovedOrderJson(
        string orderId)
    {
        return JsonSerializer.Serialize(
            new
            {
                id = orderId,
                status = "processed",
                status_detail = "accredited",
                transactions = new
                {
                    payments = new[]
                    {
                        new
                        {
                            id = "payment-123",
                            status = "processed",
                            status_detail = "accredited"
                        }
                    }
                }
            }
        );
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

    private sealed class FakeHttpMessageHandler
        : HttpMessageHandler
    {
        private readonly string? _orderJson;

        public FakeHttpMessageHandler(
            string? orderJson)
        {
            _orderJson = orderJson;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(_orderJson))
            {
                return Task.FromResult(
                    new HttpResponseMessage(
                        HttpStatusCode.NotFound
                    )
                );
            }

            var response =
                new HttpResponseMessage(
                    HttpStatusCode.OK
                )
                {
                    Content = new StringContent(
                        _orderJson,
                        Encoding.UTF8,
                        "application/json"
                    )
                };

            return Task.FromResult(response);
        }
    }

    private sealed class FakePaymentRepository
        : IPaymentRepository
    {
        private readonly List<Payment> _payments;

        public int SaveChangesCount { get; private set; }

        public FakePaymentRepository(
            params Payment[] payments)
        {
            _payments = [.. payments];
        }

        public Task AddAsync(
            Payment payment,
            CancellationToken cancellationToken = default)
        {
            _payments.Add(payment);

            return Task.CompletedTask;
        }

        public Task<Payment?> GetByIdAsync(
            int paymentId,
            CancellationToken cancellationToken = default)
        {
            var payment =
                _payments.FirstOrDefault(
                    item => item.Id == paymentId
                );

            return Task.FromResult(payment);
        }

        public Task<Payment?> GetByExternalOrderIdAsync(
            string externalOrderId,
            CancellationToken cancellationToken = default)
        {
            var payment =
                _payments.FirstOrDefault(
                    item =>
                        item.ExternalOrderId ==
                        externalOrderId
                );

            return Task.FromResult(payment);
        }

        public Task<Payment?> GetByIdempotencyKeyAsync(
            string idempotencyKey,
            CancellationToken cancellationToken = default)
        {
            var payment =
                _payments.FirstOrDefault(
                    item =>
                        item.IdempotencyKey ==
                        idempotencyKey
                );

            return Task.FromResult(payment);
        }

        public Task<Payment?> GetActiveByOrderIdAsync(
            int orderId,
            CancellationToken cancellationToken = default)
        {
            var payment =
                _payments.FirstOrDefault(
                    item =>
                        item.OrderId == orderId &&
                        (
                            item.Status ==
                                PaymentStatus.Pending ||
                            item.Status ==
                                PaymentStatus.Approved
                        )
                );

            return Task.FromResult(payment);
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            SaveChangesCount++;

            return Task.CompletedTask;
        }
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