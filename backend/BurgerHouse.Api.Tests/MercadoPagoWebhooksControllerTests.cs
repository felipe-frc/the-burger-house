using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BurgerHouse.Api.Controllers;
using BurgerHouse.Api.Webhooks.MercadoPago;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Tests;

public class MercadoPagoWebhooksControllerTests
{
    [Fact]
    public async Task PixEvolvesFromPendingToApprovedAndRepeatedApprovalIsIdempotent()
    {
        using var fixture = new Fixture { Status = "pending", Detail = "pending_waiting_transfer" };

        Assert.True(Synchronized(await fixture.Receive()));
        var pending = await fixture.Payment();
        Assert.Equal(PaymentMethod.Pix, pending.Method);
        Assert.Equal(PaymentStatus.Pending, pending.Status);
        Assert.Equal("123", pending.ExternalPaymentId);
        Assert.Equal(OrderStatus.PendingPayment, await fixture.OrderStatus());

        fixture.Status = "approved";
        fixture.Detail = "accredited";
        Assert.True(Synchronized(await fixture.Receive()));
        var approved = await fixture.Payment();
        Assert.Equal(PaymentMethod.Pix, approved.Method);
        Assert.Equal(PaymentStatus.Approved, approved.Status);
        Assert.Equal("123", approved.ExternalPaymentId);
        Assert.Equal(OrderStatus.Received, await fixture.OrderStatus());

        var approvedAt = approved.UpdatedAt;
        Assert.False(Synchronized(await fixture.Receive()));
        var repeated = await fixture.Payment();
        Assert.Equal(approvedAt, repeated.UpdatedAt);
        Assert.Equal(PaymentStatus.Approved, repeated.Status);
        Assert.Equal(OrderStatus.Received, await fixture.OrderStatus());
        Assert.Equal(1, await fixture.PaymentCount());
    }

    [Theory]
    [InlineData("approved", PaymentStatus.Approved, OrderStatus.Received)]
    [InlineData("pending", PaymentStatus.Pending, OrderStatus.PendingPayment)]
    [InlineData("rejected", PaymentStatus.Rejected, OrderStatus.PendingPayment)]
    [InlineData("cancelled", PaymentStatus.Cancelled, OrderStatus.PendingPayment)]
    [InlineData("refunded", PaymentStatus.Refunded, OrderStatus.PendingPayment)]
    [InlineData("charged_back", PaymentStatus.ChargedBack, OrderStatus.PendingPayment)]
    public async Task SynchronizesVerifiedPaymentAndRepeatsSafely(string status, PaymentStatus expected, OrderStatus orderStatus)
    {
        using var fixture = new Fixture();
        fixture.Status = status;
        Assert.IsType<OkObjectResult>(await fixture.Receive());
        var saved = await fixture.Payment();
        Assert.Equal(expected, saved.Status);
        Assert.Equal(PaymentMethod.Pix, saved.Method);
        Assert.Equal("123", saved.ExternalPaymentId);
        Assert.Equal(orderStatus, await fixture.OrderStatus());
        var updated = saved.UpdatedAt;
        Assert.IsType<OkObjectResult>(await fixture.Receive());
        Assert.Equal(updated, (await fixture.Payment()).UpdatedAt);
    }

    [Fact]
    public async Task RefundAndChargebackDoNotUndoReceivedOrder()
    {
        using var fixture = new Fixture();
        await fixture.Receive();
        fixture.Detail = "partially_refunded";
        Assert.IsType<OkObjectResult>(await fixture.Receive());
        Assert.Equal(PaymentStatus.PartiallyRefunded, (await fixture.Payment()).Status);
        fixture.Status = "charged_back";
        Assert.IsType<OkObjectResult>(await fixture.Receive());
        Assert.Equal(PaymentStatus.ChargedBack, (await fixture.Payment()).Status);
        Assert.Equal(OrderStatus.Received, await fixture.OrderStatus());
    }

    [Theory]
    [InlineData("amount")]
    [InlineData("currency")]
    [InlineData("reference")]
    [InlineData("missing-payment")]
    [InlineData("method")]
    [InlineData("external-id")]
    public async Task RejectsMismatchesWithoutSaving(string mismatch)
    {
        using var fixture = new Fixture();
        if (mismatch == "amount") fixture.Amount = 1m;
        if (mismatch == "currency") fixture.Currency = "USD";
        if (mismatch == "reference") fixture.Reference = "invalid";
        if (mismatch == "missing-payment") fixture.Reference = "999";
        if (mismatch == "method") fixture.Type = "ticket";
        if (mismatch == "external-id")
        {
            await using var db = fixture.Open();
            var payment = await db.Payments.SingleAsync();
            payment.SetExternalPaymentId("456");
            await db.SaveChangesAsync();
        }
        Assert.IsType<ConflictObjectResult>(await fixture.Receive());
        var saved = await fixture.Payment();
        Assert.Equal(PaymentStatus.Pending, saved.Status);
        if (mismatch == "external-id")
        {
            Assert.Equal("456", saved.ExternalPaymentId);
            Assert.Equal(PaymentMethod.Unknown, saved.Method);
        }
        Assert.Equal(OrderStatus.PendingPayment, await fixture.OrderStatus());
    }

    [Fact]
    public async Task InvalidSignatureNeverCallsProvider()
    {
        using var fixture = new Fixture();
        Assert.IsType<UnauthorizedObjectResult>(await fixture.Receive(validSignature: false));
        Assert.Equal(0, fixture.Calls);
    }

    [Fact]
    public async Task MissingIdAndOtherTopicDoNotCallProvider()
    {
        using var fixture = new Fixture();
        Assert.IsType<BadRequestObjectResult>(await fixture.Receive(dataId: ""));
        Assert.IsType<OkObjectResult>(await fixture.Receive(topic: "merchant_order"));
        Assert.Equal(0, fixture.Calls);
    }

    [Fact]
    public async Task ProviderNotFoundDoesNotApprove()
    {
        using var fixture = new Fixture { HttpStatus = HttpStatusCode.NotFound };
        Assert.Equal(502, Assert.IsType<ObjectResult>(await fixture.Receive()).StatusCode);
        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
    }

    [Fact]
    public async Task ProviderLookupRunsWithoutDatabaseTransaction()
    {
        using var fixture = new Fixture();
        Assert.IsType<OkObjectResult>(await fixture.Receive());
        Assert.False(fixture.TransactionObservedDuringLookup);
    }

    [Fact]
    public async Task ConcurrentWebhooksCommitOneConsistentResult()
    {
        using var fixture = new Fixture();
        var results = await Task.WhenAll(Task.Run(() => fixture.Receive()), Task.Run(() => fixture.Receive()));
        Assert.All(results, result => Assert.IsType<OkObjectResult>(result));
        Assert.Equal(PaymentStatus.Approved, (await fixture.Payment()).Status);
        Assert.Equal(OrderStatus.Received, await fixture.OrderStatus());
    }

    [Fact]
    public async Task FailureSavingOrderRollsBackPaymentAndRetrySucceeds()
    {
        using var fixture = new Fixture();
        await using (var db = fixture.Open())
            await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER fail_order BEFORE UPDATE ON Orders BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;");
        Assert.Equal(503, Assert.IsType<ObjectResult>(await fixture.Receive()).StatusCode);
        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Equal(PaymentMethod.Unknown, payment.Method);
        Assert.Null(payment.ExternalPaymentId);
        Assert.Equal(OrderStatus.PendingPayment, await fixture.OrderStatus());
        await using (var db = fixture.Open()) await db.Database.ExecuteSqlRawAsync("DROP TRIGGER fail_order");
        Assert.IsType<OkObjectResult>(await fixture.Receive());
        Assert.Equal(OrderStatus.Received, await fixture.OrderStatus());
    }

    [Fact]
    public async Task MissingOrderIsRejectedWithoutPaymentUpdate()
    {
        using var fixture = new Fixture();
        await using (var db = fixture.Open())
        {
            await db.Database.OpenConnectionAsync();
            await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = OFF;");
            await db.Database.ExecuteSqlRawAsync("DELETE FROM Orders;");
        }
        Assert.IsType<ConflictObjectResult>(await fixture.Receive());
        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
    }

    internal sealed class Fixture : IDisposable
    {
        private const string Secret = "local-test-webhook-secret";
        private readonly string _path = Path.Combine(Path.GetTempPath(), $"burger-webhook-{Guid.NewGuid()}.db");
        public string Status = "approved", Detail = "accredited", Currency = "BRL", Type = "bank_transfer", Reference = "1";
        public decimal Amount = 43.90m;
        public HttpStatusCode HttpStatus = HttpStatusCode.OK;
        public int Calls;
        public bool TransactionObservedDuringLookup;
        public Fixture()
        {
            using var db = Open();
            db.Database.EnsureCreated();
            var order = new Order(0);
            order.AddItem(new OrderItem(1, 1, 43.90m));
            db.Orders.Add(order);
            db.SaveChanges();
            var payment = new Payment(order.Id, order.Total, Guid.NewGuid().ToString("D"), PaymentMethod.Unknown);
            payment.SetExternalPreferenceId("pref-1");
            db.Payments.Add(payment);
            db.SaveChanges();
            Reference = payment.Id.ToString();
        }
        public BurgerHouseDbContext Open() => new(new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite($"Data Source={_path};Pooling=False;Default Timeout=10").Options);
        public async Task<Payment> Payment() { await using var db = Open(); return await db.Payments.SingleAsync(); }
        public async Task<int> PaymentCount() { await using var db = Open(); return await db.Payments.CountAsync(); }
        public async Task<OrderStatus> OrderStatus() { await using var db = Open(); return (await db.Orders.SingleAsync()).Status; }
        public async Task<IActionResult> Receive(bool validSignature = true, string dataId = "123", string topic = "payment")
        {
            await using var db = Open();
            using var http = new HttpClient(new Stub(this, () => db.Database.CurrentTransaction is not null));
            var options = Options.Create(new MercadoPagoOptions { AccessToken = "local-test-token", WebhookSecret = Secret });
            var controller = new MercadoPagoWebhooksController(new MercadoPagoWebhookSignatureValidator(options),
                new MercadoPagoPaymentLookup(http, options),
                new SynchronizeCheckoutPaymentHandler(new PaymentRepository(db), new OrderRepository(db)), db);
            var context = new DefaultHttpContext();
            context.Request.QueryString = new QueryString($"?data.id={dataId}&type={topic}");
            var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var hash = HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), Encoding.UTF8.GetBytes($"id:{dataId};request-id:test-request;ts:{ts};"));
            context.Request.Headers["x-signature"] = validSignature ? $"ts={ts},v1={Convert.ToHexString(hash).ToLowerInvariant()}" : "invalid";
            context.Request.Headers["x-request-id"] = "test-request";
            controller.ControllerContext = new ControllerContext { HttpContext = context };
            return await controller.Receive(new MercadoPagoWebhookRequest { Type = topic, Data = new MercadoPagoWebhookData { Id = dataId } }, default);
        }
        public void Dispose() => File.Delete(_path);
        private sealed class Stub(Fixture fixture, Func<bool> hasActiveTransaction) : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            {
                Interlocked.Increment(ref fixture.Calls);
                fixture.TransactionObservedDuringLookup = hasActiveTransaction();
                var payload = new { id = "123", external_reference = fixture.Reference, status = fixture.Status, status_detail = fixture.Detail,
                    transaction_amount = fixture.Amount, currency_id = fixture.Currency, payment_type_id = fixture.Type, payment_method_id = "pix" };
                return Task.FromResult(new HttpResponseMessage(fixture.HttpStatus) { Content = new StringContent(JsonSerializer.Serialize(payload)) });
            }
        }
    }

    private static bool Synchronized(IActionResult result)
    {
        var ok = Assert.IsType<OkObjectResult>(result);
        var response = JsonSerializer.SerializeToElement(ok.Value);
        Assert.True(response.GetProperty("received").GetBoolean());
        return response.GetProperty("synchronized").GetBoolean();
    }
}
