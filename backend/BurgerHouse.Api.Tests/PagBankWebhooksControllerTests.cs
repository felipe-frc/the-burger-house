using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BurgerHouse.Api.Controllers;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Tests;

public class PagBankWebhooksControllerTests
{
    [Fact]
    public async Task ApprovedWebhookUpdatesPaymentAndOrderAndDuplicateIsIdempotent()
    {
        using var fixture = new Fixture();

        Assert.True(Synchronized(await fixture.Receive()));
        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.Equal(PaymentMethod.Pix, payment.Method);
        Assert.Equal("CHAR_1", payment.ExternalPaymentId);
        Assert.Equal(OrderStatus.Received, await fixture.OrderStatus());
        var updatedAt = payment.UpdatedAt;

        Assert.False(Synchronized(await fixture.Receive()));
        Assert.Equal(updatedAt, (await fixture.Payment()).UpdatedAt);
        Assert.Equal(1, await fixture.PaymentCount());
    }

    [Theory]
    [InlineData("AUTHORIZED", PaymentStatus.Pending, OrderStatus.PendingPayment)]
    [InlineData("IN_ANALYSIS", PaymentStatus.Pending, OrderStatus.PendingPayment)]
    [InlineData("WAITING", PaymentStatus.Pending, OrderStatus.PendingPayment)]
    [InlineData("DECLINED", PaymentStatus.Rejected, OrderStatus.PendingPayment)]
    [InlineData("CANCELED", PaymentStatus.Cancelled, OrderStatus.PendingPayment)]
    public async Task MapsVerifiedProviderState(string status, PaymentStatus paymentStatus, OrderStatus orderStatus)
    {
        using var fixture = new Fixture { ChargeStatus = status };

        Assert.IsType<OkObjectResult>(await fixture.Receive());

        Assert.Equal(paymentStatus, (await fixture.Payment()).Status);
        Assert.Equal(orderStatus, await fixture.OrderStatus());
    }

    [Theory]
    [InlineData("missing-payment")]
    [InlineData("missing-checkout")]
    [InlineData("reference")]
    [InlineData("amount")]
    [InlineData("currency")]
    [InlineData("external-payment")]
    public async Task RejectsCorrelationMismatchWithoutUpdating(string mismatch)
    {
        using var fixture = new Fixture();
        if (mismatch == "missing-payment") fixture.WebhookReference = "payment:999";
        if (mismatch == "missing-checkout") await fixture.ClearCheckoutId();
        if (mismatch == "reference") fixture.ChargeReference = "payment:999";
        if (mismatch == "amount") fixture.AmountInCents = 100;
        if (mismatch == "currency") fixture.Currency = "USD";
        if (mismatch == "external-payment") await fixture.SetExternalPaymentId("CHAR_old");

        Assert.IsType<ConflictObjectResult>(await fixture.Receive());

        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Equal(PaymentMethod.Unknown, payment.Method);
        if (mismatch != "external-payment") Assert.Null(payment.ExternalPaymentId);
        Assert.Equal(OrderStatus.PendingPayment, await fixture.OrderStatus());
    }

    [Fact]
    public async Task InvalidSignatureDoesNotCallChargeApi()
    {
        using var fixture = new Fixture();

        Assert.IsType<UnauthorizedObjectResult>(await fixture.Receive(validSignature: false));

        Assert.Equal(0, fixture.LookupCalls);
        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
    }

    [Fact]
    public async Task SelectsSinglePaidChargeFromMultipleAttempts()
    {
        using var fixture = new Fixture
        {
            LookupChargeId = "CHAR_paid",
            WebhookCharges =
            [
                new("CHAR_declined", "DECLINED"),
                new("CHAR_paid", "PAID")
            ]
        };

        Assert.True(Synchronized(await fixture.Receive()));

        var payment = await fixture.Payment();
        Assert.Equal("CHAR_paid", payment.ExternalPaymentId);
        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.Equal(OrderStatus.Received, await fixture.OrderStatus());
    }

    [Fact]
    public async Task RejectsTwoValidPaidChargesAsAmbiguous()
    {
        using var fixture = new Fixture
        {
            WebhookCharges =
            [
                new("CHAR_paid_1", "PAID"),
                new("CHAR_paid_2", "PAID")
            ]
        };

        Assert.IsType<ConflictObjectResult>(await fixture.Receive());

        Assert.Equal(0, fixture.LookupCalls);
        Assert.Null((await fixture.Payment()).ExternalPaymentId);
        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
    }

    [Fact]
    public async Task ExistingExternalPaymentIdSelectsOnlyExactCharge()
    {
        using var fixture = new Fixture
        {
            ChargeStatus = "WAITING",
            LookupChargeId = "CHAR_bound",
            WebhookCharges =
            [
                new("CHAR_other", "PAID"),
                new("CHAR_bound", "WAITING")
            ]
        };
        await fixture.SetExternalPaymentId("CHAR_bound");

        Assert.IsType<OkObjectResult>(await fixture.Receive());

        var payment = await fixture.Payment();
        Assert.Equal("CHAR_bound", payment.ExternalPaymentId);
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Equal(1, fixture.LookupCalls);
    }

    [Fact]
    public async Task RejectsUnknownMethodForPaidChargeWithoutLookup()
    {
        using var fixture = new Fixture { PaymentMethodType = "BOLETO" };

        Assert.IsType<ConflictObjectResult>(await fixture.Receive());

        Assert.Equal(0, fixture.LookupCalls);
        Assert.Null((await fixture.Payment()).ExternalPaymentId);
        Assert.Equal(PaymentMethod.Unknown, (await fixture.Payment()).Method);
    }

    [Fact]
    public async Task ProviderUnavailableDoesNotUpdatePayment()
    {
        using var fixture = new Fixture { LookupStatus = HttpStatusCode.InternalServerError };

        Assert.Equal(502, Assert.IsType<ObjectResult>(await fixture.Receive()).StatusCode);

        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
        Assert.Equal(OrderStatus.PendingPayment, await fixture.OrderStatus());
    }

    [Fact]
    public async Task InvalidProviderResponseDoesNotUpdatePayment()
    {
        using var fixture = new Fixture { InvalidLookupJson = true };

        Assert.Equal(502, Assert.IsType<ObjectResult>(await fixture.Receive()).StatusCode);

        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
        Assert.Equal(OrderStatus.PendingPayment, await fixture.OrderStatus());
    }

    [Fact]
    public async Task OfficialLookupRunsBeforeShortDatabaseTransaction()
    {
        using var fixture = new Fixture();

        Assert.IsType<OkObjectResult>(await fixture.Receive());

        Assert.False(fixture.TransactionObservedDuringLookup);
    }

    [Fact]
    public async Task DelayedPendingWebhookDoesNotRegressApprovedPayment()
    {
        using var fixture = new Fixture();
        Assert.True(Synchronized(await fixture.Receive()));
        fixture.ChargeStatus = "WAITING";

        Assert.False(Synchronized(await fixture.Receive()));

        Assert.Equal(PaymentStatus.Approved, (await fixture.Payment()).Status);
        Assert.Equal(OrderStatus.Received, await fixture.OrderStatus());
    }

    [Fact]
    public async Task ConcurrentDuplicateWebhooksCommitOneConsistentResult()
    {
        using var fixture = new Fixture();

        var results = await Task.WhenAll(
            Task.Run(() => fixture.Receive()),
            Task.Run(() => fixture.Receive()));

        Assert.All(results, result => Assert.IsType<OkObjectResult>(result));
        Assert.Equal(PaymentStatus.Approved, (await fixture.Payment()).Status);
        Assert.Equal(OrderStatus.Received, await fixture.OrderStatus());
        Assert.Equal(1, await fixture.PaymentCount());
    }

    [Fact]
    public async Task PaymentAndOrderRollbackTogetherWhenOrderWriteFails()
    {
        using var fixture = new Fixture();
        await using (var db = fixture.Open())
        {
            await db.Database.ExecuteSqlRawAsync(
                "CREATE TRIGGER fail_order BEFORE UPDATE ON Orders " +
                "BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;");
        }

        Assert.Equal(503, Assert.IsType<ObjectResult>(await fixture.Receive()).StatusCode);

        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Equal(PaymentMethod.Unknown, payment.Method);
        Assert.Null(payment.ExternalPaymentId);
        Assert.Equal(OrderStatus.PendingPayment, await fixture.OrderStatus());
    }

    [Theory]
    [InlineData("401")]
    [InlineData("403")]
    [InlineData("404")]
    [InlineData("500")]
    [InlineData("timeout")]
    [InlineData("json")]
    [InlineData("base64")]
    [InlineData("x509")]
    public async Task PublicKeyFailuresReturn502WithoutCallingChargeApi(string failure)
    {
        using var fixture = new Fixture { PublicKeyFailure = failure };
        Assert.Equal(502, Assert.IsType<ObjectResult>(await fixture.Receive()).StatusCode);
        Assert.Equal(0, fixture.LookupCalls);
        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
    }

    [Fact]
    public async Task MultipleHeaderOccurrencesAcceptOneValidSignature()
    {
        using var fixture = new Fixture { MultipleSignatures = true };
        Assert.IsType<OkObjectResult>(await fixture.Receive());
    }

    [Fact]
    public void UnsignedSandboxOverrideDefaultsToDisabled()
    {
        Assert.False(new PagBankOptions().AllowUnsignedSandboxWebhooks);
    }

    [Theory]
    [InlineData("https://sandbox.api.pagseguro.com", false, "missing", false, false)]
    [InlineData("https://sandbox.api.pagseguro.com", true, "missing", true, true)]
    [InlineData("https://sandbox.api.pagseguro.com/", true, "missing", true, true)]
    [InlineData("https://sandbox.api.pagseguro.com", true, "invalid", false, false)]
    [InlineData("https://sandbox.api.pagseguro.com", true, "empty", false, false)]
    [InlineData("https://sandbox.api.pagseguro.com", true, "whitespace", false, false)]
    [InlineData("https://api.pagseguro.com", true, "missing", false, false)]
    [InlineData("https://api.pagseguro.com", true, "valid", true, false)]
    [InlineData("https://sandbox.api.pagseguro.com", true, "valid", true, false)]
    [InlineData("https://sandbox.api.pagseguro.com", false, "valid", true, false)]
    [InlineData("https://sandbox.api.pagseguro.com.example.com", true, "missing", false, false)]
    [InlineData("https://sandbox.api.pagseguro.com/path", true, "missing", false, false)]
    [InlineData("https://sandbox.api.pagseguro.com/?test=1", true, "missing", false, false)]
    [InlineData("https://sandbox.api.pagseguro.com/#test", true, "missing", false, false)]
    [InlineData("https://sandbox.api.pagseguro.com:8443", true, "missing", false, false)]
    public async Task UnsignedOverrideRequiresExplicitSandboxAndAbsentHeader(
        string baseUrl, bool allowUnsigned, string header, bool accepted, bool overridden)
    {
        using var fixture = new Fixture
        {
            BaseUrl = baseUrl,
            AllowUnsigned = allowUnsigned,
            SignatureHeader = header
        };
        var result = await fixture.Receive();
        if (accepted)
        {
            Assert.True(Synchronized(result));
            Assert.Equal(1, fixture.LookupCalls);
        }
        else
        {
            Assert.IsType<UnauthorizedObjectResult>(result);
            Assert.Equal(0, fixture.LookupCalls);
            Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
        }
        Assert.Equal(header == "valid" ? 1 : header == "invalid" ? 2 : 0, fixture.PublicKeyCalls);
        var warnings = fixture.Logger.Entries.Where(entry =>
            entry.Message == "PagBank unsigned sandbox webhook accepted by explicit development override.").ToArray();
        Assert.Equal(overridden ? 1 : 0, warnings.Length);
        Assert.All(warnings, entry =>
        {
            Assert.Equal(LogLevel.Warning, entry.Level);
            Assert.Null(entry.Exception);
        });
    }

    [Fact]
    public async Task UnsignedOverrideStillRequiresSuccessfulProviderVerification()
    {
        using var fixture = new Fixture
        {
            AllowUnsigned = true,
            SignatureHeader = "missing",
            LookupStatus = HttpStatusCode.InternalServerError
        };
        Assert.Equal(502, Assert.IsType<ObjectResult>(await fixture.Receive()).StatusCode);
        Assert.Equal(0, fixture.PublicKeyCalls);
        Assert.Equal(1, fixture.LookupCalls);
        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
    }

    private sealed class CaptureLogger : ILogger<PagBankWebhooksController>
    {
        public System.Collections.Concurrent.ConcurrentQueue<(LogLevel Level, string Message, Exception? Exception)> Entries { get; } = new();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Enqueue((logLevel, formatter(state, exception), exception));
    }

    private static bool Synchronized(IActionResult result)
    {
        var body = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result).Value);
        Assert.True(body.GetProperty("received").GetBoolean());
        return body.GetProperty("synchronized").GetBoolean();
    }

    private sealed class Fixture : IDisposable
    {
        private readonly string _path = Path.Combine(Path.GetTempPath(), $"burger-pagbank-webhook-{Guid.NewGuid()}.db");
        private readonly ECDsa _signer = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        private int _paymentId;

        public string ChargeStatus = "PAID";
        public string ChargeReference = "";
        public string WebhookReference = "";
        public string WebhookResourceId = "ORDE_1";
        public string Currency = "BRL";
        public int AmountInCents = 4390;
        public string PaymentMethodType = "PIX";
        public string LookupChargeId = "CHAR_1";
        public ChargeSpec[]? WebhookCharges;
        public HttpStatusCode LookupStatus = HttpStatusCode.OK;
        public bool InvalidLookupJson;
        public string? PublicKeyFailure;
        public bool MultipleSignatures;
        public string BaseUrl = "https://sandbox.api.pagseguro.com";
        public bool AllowUnsigned;
        public string? SignatureHeader;
        public int PublicKeyCalls;
        public CaptureLogger Logger { get; } = new();
        public int LookupCalls;
        public bool TransactionObservedDuringLookup;

        public Fixture()
        {
            using var db = Open();
            db.Database.EnsureCreated();
            var order = new Order(0);
            order.AddItem(new OrderItem(1, 1, 43.90m));
            db.Orders.Add(order);
            db.SaveChanges();
            var payment = new Payment(
                order.Id,
                order.Total,
                Guid.NewGuid().ToString("D"),
                PaymentMethod.Unknown);
            payment.SetExternalCheckoutId("CHEC_1");
            db.Payments.Add(payment);
            db.SaveChanges();
            _paymentId = payment.Id;
            ChargeReference = $"payment:{_paymentId}";
            WebhookReference = ChargeReference;
        }

        public BurgerHouseDbContext Open() => new(
            new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite($"Data Source={_path};Pooling=False;Default Timeout=10")
                .Options);

        public async Task<IActionResult> Receive(bool validSignature = true)
        {
            await using var db = Open();
            using var signatureHttp = new HttpClient(new Stub(_ =>
            {
                Interlocked.Increment(ref PublicKeyCalls);
                if (PublicKeyFailure == "timeout") throw new TaskCanceledException();
                if (int.TryParse(PublicKeyFailure, out var status))
                    return Task.FromResult(new HttpResponseMessage((HttpStatusCode)status));
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(PublicKeyFailure == "json" ? "not-json" :
                        JsonSerializer.Serialize(new
                        {
                            public_key = PublicKeyFailure switch
                            {
                                "base64" => "not-base64",
                                "x509" => "AA==",
                                _ => Convert.ToBase64String(_signer.ExportSubjectPublicKeyInfo())
                            }
                        }))
                });
            }));
            using var lookupHttp = new HttpClient(new Stub(_ =>
            {
                Interlocked.Increment(ref LookupCalls);
                TransactionObservedDuringLookup = db.Database.CurrentTransaction is not null;
                return Task.FromResult(new HttpResponseMessage(LookupStatus)
                {
                    Content = new StringContent(InvalidLookupJson
                        ? "not-json"
                        : JsonSerializer.Serialize(new
                        {
                            id = LookupChargeId,
                            reference_id = ChargeReference,
                            status = ChargeStatus,
                            amount = new
                            {
                                value = AmountInCents,
                                currency = Currency,
                                summary = new { total = AmountInCents, refunded = 0 }
                            },
                            payment_method = new { type = PaymentMethodType }
                        }))
                });
            }));
            var options = Options.Create(new PagBankOptions
            {
                BaseUrl = BaseUrl,
                AllowUnsignedSandboxWebhooks = AllowUnsigned,
                Token = "local-test-token"
            });
            var controller = new PagBankWebhooksController(
                new PagBankWebhookSignatureValidator(signatureHttp, options),
                new PagBankPaymentLookup(lookupHttp, options),
                new SynchronizeCheckoutPaymentHandler(new PaymentRepository(db), new OrderRepository(db)),
                db,
                Logger,
                options);
            var charges = WebhookCharges ?? [new ChargeSpec("CHAR_1", ChargeStatus)];
            var body = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
            {
                id = WebhookResourceId,
                reference_id = WebhookReference,
                charges = charges.Select(charge => new
                {
                    id = charge.Id,
                    reference_id = charge.Reference ?? ChargeReference,
                    status = charge.Status,
                    amount = new
                    {
                        value = charge.AmountInCents ?? AmountInCents,
                        currency = charge.Currency ?? Currency,
                        summary = new
                        {
                            total = charge.AmountInCents ?? AmountInCents,
                            refunded = 0
                        }
                    },
                    payment_method = new { type = charge.Method ?? PaymentMethodType }
                })
            }));
            var signature = Convert.ToBase64String(_signer.SignData(
                body,
                HashAlgorithmName.SHA256,
                DSASignatureFormat.Rfc3279DerSequence));
            var context = new DefaultHttpContext();
            context.Request.Body = new MemoryStream(body);
            context.Request.ContentLength = body.Length;
            context.Request.ContentType = "application/json";
            context.Request.Headers["x-payload-signature"] = validSignature ? signature : "invalid";
            if (SignatureHeader == "missing") context.Request.Headers.Remove("x-payload-signature");
            if (SignatureHeader == "invalid") context.Request.Headers["x-payload-signature"] = "invalid";
            if (SignatureHeader == "empty") context.Request.Headers["x-payload-signature"] = "";
            if (SignatureHeader == "whitespace") context.Request.Headers["x-payload-signature"] = " ";
            if (MultipleSignatures)
                context.Request.Headers.Append("x-payload-signature", "invalid");
            controller.ControllerContext = new ControllerContext { HttpContext = context };
            return await controller.Receive(default);
        }

        public async Task<Payment> Payment()
        {
            await using var db = Open();
            return await db.Payments.SingleAsync();
        }

        public async Task<int> PaymentCount()
        {
            await using var db = Open();
            return await db.Payments.CountAsync();
        }

        public async Task<OrderStatus> OrderStatus()
        {
            await using var db = Open();
            return (await db.Orders.SingleAsync()).Status;
        }

        public async Task ClearCheckoutId()
        {
            await using var db = Open();
            await db.Database.ExecuteSqlRawAsync("UPDATE Payments SET ExternalCheckoutId = NULL");
        }

        public async Task SetExternalPaymentId(string value)
        {
            await using var db = Open();
            var payment = await db.Payments.SingleAsync();
            payment.SetExternalPaymentId(value);
            await db.SaveChangesAsync();
        }

        public void Dispose()
        {
            _signer.Dispose();
            File.Delete(_path);
        }

        public sealed record ChargeSpec(
            string Id,
            string Status,
            string? Reference = null,
            int? AmountInCents = null,
            string? Currency = null,
            string? Method = null);

        private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request);
        }
    }
}
