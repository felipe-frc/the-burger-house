using System.Net;
using System.Text.Json;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Tests.Payments.PagBank;

public class PagBankPaymentReconciliationServiceTests
{
    [Fact]
    public async Task PaidChargeApprovesPaymentAndUpdatesOrder()
    {
        using var fixture = new Fixture();

        await fixture.Reconcile();

        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.Equal(PaymentMethod.CreditCard, payment.Method);
        Assert.Equal("CHAR_1", payment.ExternalPaymentId);
        Assert.Equal(OrderStatus.Received, await fixture.GetOrderStatus());
        Assert.Equal(1, fixture.LookupCalls);
        Assert.Equal(0, fixture.CheckoutCalls);
        Assert.Equal(0, fixture.OrderCalls);
        Assert.False(fixture.TransactionObservedDuringLookup);
    }

    [Theory]
    [InlineData("AUTHORIZED", "CREDIT_CARD", PaymentStatus.Pending)]
    [InlineData("IN_ANALYSIS", "CREDIT_CARD", PaymentStatus.Pending)]
    [InlineData("WAITING", "BOLETO", PaymentStatus.Pending)]
    [InlineData("DECLINED", "PIX", PaymentStatus.Rejected)]
    [InlineData("CANCELED", "PIX", PaymentStatus.Cancelled)]
    public async Task MapsVerifiedChargeStatus(
        string providerStatus,
        string providerMethod,
        PaymentStatus expectedStatus)
    {
        using var fixture = new Fixture
        {
            ProviderStatus = providerStatus,
            ProviderMethod = providerMethod
        };

        await fixture.Reconcile();

        Assert.Equal(expectedStatus, (await fixture.Payment()).Status);
        Assert.Equal(OrderStatus.PendingPayment, await fixture.GetOrderStatus());
    }

    [Fact]
    public async Task CheckoutWithoutOrdersReturnsLocalStateWithoutChargeLookup()
    {
        using var fixture = new Fixture(setExternalPaymentId: false);

        await fixture.Reconcile();

        Assert.Equal(0, fixture.LookupCalls);
        Assert.Equal(1, fixture.CheckoutCalls);
        await fixture.AssertPending();
    }

    [Fact]
    public async Task CheckoutDiscoveryApprovesPixAndPreservesFinancialHistory()
    {
        using var fixture = new Fixture(false) { DiscoverOrder = true, ProviderMethod = "PIX" };
        await fixture.Reconcile();
        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.Equal(PaymentMethod.Pix, payment.Method);
        Assert.Equal("CHAR_1", payment.ExternalPaymentId);
        Assert.NotNull(payment.ApprovedAt);
        Assert.Equal(OrderStatus.Received, await fixture.GetOrderStatus());
        await fixture.Reconcile();
        Assert.Equal(1, fixture.CheckoutCalls);
        Assert.Equal(1, fixture.OrderCalls);
        Assert.Equal(2, fixture.LookupCalls);
        Assert.Equal(payment.ApprovedAt, (await fixture.Payment()).ApprovedAt);
        await using (var db = fixture.Open()) Assert.Empty(await db.PaymentRefunds.ToListAsync());
        fixture.RefundedInCents = 1000;
        await fixture.Reconcile();
        await fixture.Reconcile();
        fixture.RefundedInCents = 2000;
        await fixture.Reconcile();
        await using var final = fixture.Open();
        Assert.Equal(new decimal[] { 10, 10 }, await final.PaymentRefunds.OrderBy(r => r.Id).Select(r => r.Amount).ToArrayAsync());
        Assert.Equal(20, (await fixture.Payment()).RefundedAmount);
        Assert.False(fixture.TransactionObservedDuringLookup);
    }

    [Fact]
    public async Task DiscoveredWaitingChargeRemainsPending()
    {
        using var fixture = new Fixture(false) { DiscoverOrder = true, ProviderStatus = "WAITING", ProviderMethod = "PIX" };
        await fixture.Reconcile();
        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
        Assert.Equal("CHAR_1", (await fixture.Payment()).ExternalPaymentId);
        Assert.Equal(OrderStatus.PendingPayment, await fixture.GetOrderStatus());
    }

    [Theory]
    [InlineData("checkout-id")]
    [InlineData("checkout-reference")]
    [InlineData("multiple-orders")]
    [InlineData("order-id")]
    [InlineData("order-reference")]
    [InlineData("no-charges")]
    [InlineData("multiple-charges")]
    [InlineData("charge-id")]
    [InlineData("reference")]
    [InlineData("currency")]
    [InlineData("amount")]
    [InlineData("canonical-id")]
    [InlineData("local-order-total")]
    public async Task InvalidDiscoveryDoesNotPersistAssociation(string mismatch)
    {
        using var fixture = new Fixture(false) { DiscoverOrder = true, DiscoveryMismatch = mismatch };
        if (mismatch == "local-order-total")
        {
            await using var db = fixture.Open();
            await db.Database.ExecuteSqlRawAsync("UPDATE OrderItems SET UnitPrice = 1");
        }
        await fixture.Reconcile();
        await fixture.AssertPending();
        Assert.Null((await fixture.Payment()).ExternalPaymentId);
    }

    [Fact]
    public async Task ConcurrentDiscoveriesAreIdempotent()
    {
        using var fixture = new Fixture(false) { DiscoverOrder = true, ProviderMethod = "PIX" };
        await Task.WhenAll(fixture.Reconcile(), fixture.Reconcile());
        Assert.Equal(PaymentStatus.Approved, (await fixture.Payment()).Status);
        Assert.Equal(OrderStatus.Received, await fixture.GetOrderStatus());
        Assert.Equal("CHAR_1", (await fixture.Payment()).ExternalPaymentId);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"id\":\"CHEC_1\",\"reference_id\":\"payment:1\",\"charges\":[]}")]
    [InlineData("{\"id\":\"CHEC_1\",\"reference_id\":\"payment:1\",\"orders\":[null]}")]
    [InlineData("{\"id\":\"CHEC_1\",\"reference_id\":\"payment:1\",\"orders\":{}}")]
    [InlineData("not-json")]
    public async Task UnrecognizedCheckoutResponseDoesNotInventChargeStructure(string json)
    {
        using var fixture = new Fixture(false) { CheckoutJson = json };
        await fixture.Reconcile();
        await fixture.AssertPending();
        Assert.Null((await fixture.Payment()).ExternalPaymentId);
        Assert.Equal(0, fixture.LookupCalls);
    }

    [Fact]
    public async Task DiscoveredChargeAssociationRollsBackWithOrderWriteFailure()
    {
        using var fixture = new Fixture(false) { DiscoverOrder = true };
        await fixture.AddFailingOrderTrigger();
        await fixture.Reconcile();
        await fixture.AssertPending();
        Assert.Null((await fixture.Payment()).ExternalPaymentId);
    }

    [Theory]
    [InlineData(PaymentStatus.Rejected)]
    [InlineData(PaymentStatus.Cancelled)]
    [InlineData(PaymentStatus.Refunded)]
    [InlineData(PaymentStatus.ChargedBack)]
    public async Task FinalPaymentDoesNotCallProvider(PaymentStatus status)
    {
        using var fixture = new Fixture();
        await fixture.SetStatus(status);

        await fixture.Reconcile();

        Assert.Equal(0, fixture.LookupCalls);
    }

    [Theory]
    [InlineData(1000, PaymentStatus.PartiallyRefunded)]
    [InlineData(4390, PaymentStatus.Refunded)]
    public async Task ApprovedPaymentCanReconcileRefund(int refunded, PaymentStatus expected)
    {
        using var fixture = new Fixture { RefundedInCents = refunded };
        await fixture.ApproveLocally();

        await fixture.Reconcile();

        Assert.Equal(expected, (await fixture.Payment()).Status);
        Assert.Equal(refunded / 100m, (await fixture.Payment()).RefundedAmount);
        Assert.Equal(OrderStatus.Received, await fixture.GetOrderStatus());
    }

    [Theory]
    [InlineData("id")]
    [InlineData("reference")]
    [InlineData("amount")]
    [InlineData("currency")]
    public async Task CorrelationMismatchDoesNotUpdate(string mismatch)
    {
        using var fixture = new Fixture();
        if (mismatch == "id") fixture.ResponseChargeId = "CHAR_other";
        if (mismatch == "reference") fixture.ChargeReference = "payment:999";
        if (mismatch == "amount") fixture.AmountInCents = 100;
        if (mismatch == "currency") fixture.Currency = "USD";

        await fixture.Reconcile();

        await fixture.AssertPending();
    }

    [Fact]
    public async Task UnknownMethodOnPaidChargeDoesNotApprove()
    {
        using var fixture = new Fixture { ProviderMethod = "BOLETO" };

        await fixture.Reconcile();

        await fixture.AssertPending();
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task ProviderFailureKeepsLocalState(HttpStatusCode status)
    {
        using var fixture = new Fixture { ResponseStatus = status };

        await fixture.Reconcile();

        await fixture.AssertPending();
    }

    [Fact]
    public async Task TimeoutKeepsLocalState()
    {
        using var fixture = new Fixture { Timeout = true };

        await fixture.Reconcile();

        await fixture.AssertPending();
    }

    [Fact]
    public async Task InvalidJsonKeepsLocalState()
    {
        using var fixture = new Fixture { InvalidJson = true };

        await fixture.Reconcile();

        await fixture.AssertPending();
    }

    [Fact]
    public async Task PaymentAndOrderRollBackTogetherWhenOrderWriteFails()
    {
        using var fixture = new Fixture();
        await fixture.AddFailingOrderTrigger();

        await fixture.Reconcile();

        await fixture.AssertPending();
    }

    [Fact]
    public async Task ConcurrentReconciliationsLeaveOneConsistentResult()
    {
        using var fixture = new Fixture();

        await Task.WhenAll(fixture.Reconcile(), fixture.Reconcile());

        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.Equal(PaymentMethod.CreditCard, payment.Method);
        Assert.Equal("CHAR_1", payment.ExternalPaymentId);
        Assert.Equal(OrderStatus.Received, await fixture.GetOrderStatus());
    }

    [Fact]
    public async Task ConcurrentRefundSnapshotsAndRepeatedReconciliationCreateOnlyOneDelta()
    {
        using var fixture = new Fixture();
        await fixture.ApproveLocally();
        var approved = (await fixture.Payment()).ApprovedAt;
        fixture.RefundedInCents = 1000;
        await Task.WhenAll(fixture.Reconcile(), fixture.Reconcile());
        await fixture.Reconcile();
        await using (var db = fixture.Open())
        {
            Assert.Equal(10, Assert.Single(await db.PaymentRefunds.ToListAsync()).Amount);
        }
        fixture.RefundedInCents = 2000;
        await fixture.Reconcile();
        fixture.RefundedInCents = 4390;
        await fixture.Reconcile();
        await using var final = fixture.Open();
        Assert.Equal(new decimal[] { 10, 10, 23.90m }, await final.PaymentRefunds.OrderBy(r => r.Id).Select(r => r.Amount).ToArrayAsync());
        var payment = await final.Payments.SingleAsync();
        Assert.Equal(approved, payment.ApprovedAt);
        Assert.Equal(43.90m, payment.RefundedAmount);
        Assert.Equal(PaymentStatus.Refunded, payment.Status);
    }

    private sealed class Fixture : IDisposable
    {
        private readonly string _path = Path.Combine(
            Path.GetTempPath(),
            $"burger-pagbank-charge-reconciliation-{Guid.NewGuid()}.db"
        );
        private readonly IOptions<PagBankOptions> _options = Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com",
            Token = "local-test-token"
        });

        public int PaymentId { get; }
        public int LookupCalls;
        public int CheckoutCalls;
        public int OrderCalls;
        public bool DiscoverOrder;
        public string? CheckoutJson;
        public string? DiscoveryMismatch;
        public bool TransactionObservedDuringLookup;
        public bool Timeout;
        public bool InvalidJson;
        public HttpStatusCode ResponseStatus = HttpStatusCode.OK;
        public string ResponseChargeId = "CHAR_1";
        public string ChargeReference { get; set; }
        public string ProviderStatus = "PAID";
        public string ProviderMethod = "CREDIT_CARD";
        public string Currency = "BRL";
        public int AmountInCents = 4390;
        public int RefundedInCents;

        public Fixture(bool setExternalPaymentId = true)
        {
            using var db = Open();
            db.Database.EnsureCreated();
            var order = new Order(
    0,
    "pickup",
    "Cliente Teste",
    "11999990000",
    "cliente@teste.com",
    "52998224725"
);
            order.AddItem(new OrderItem(1, 1, 43.90m));
            db.Orders.Add(order);
            db.SaveChanges();
            var payment = new Payment(
                order.Id,
                order.Total,
                Guid.NewGuid().ToString("D"),
                PaymentMethod.Unknown
            );
            payment.SetExternalCheckoutId("CHEC_1");
            if (setExternalPaymentId)
                payment.SetExternalPaymentId("CHAR_1");
            db.Payments.Add(payment);
            db.SaveChanges();
            PaymentId = payment.Id;
            ChargeReference = $"payment:{PaymentId}";
        }

        public BurgerHouseDbContext Open() => new(
            new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite($"Data Source={_path};Pooling=False;Default Timeout=10")
                .Options
        );

        public async Task Reconcile()
        {
            await using var db = Open();
            using var http = new HttpClient(new Stub(request =>
            {
                Assert.Equal("sandbox.api.pagseguro.com", request.RequestUri!.Host);
                Assert.Equal(HttpMethod.Get, request.Method);
                Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
                Assert.Equal("local-test-token", request.Headers.Authorization?.Parameter);
                var mismatch = DiscoveryMismatch;
                if (request.RequestUri.AbsolutePath == "/checkouts/CHEC_1")
                {
                    Interlocked.Increment(ref CheckoutCalls);
                    Assert.Equal("?offset=0&limit=100", request.RequestUri.Query);
                    var orders = !DiscoverOrder ? Array.Empty<object>() : Enumerable.Range(0, mismatch == "multiple-orders" ? 2 : 1)
                        .Select(i => (object)new { id = $"ORDE_{i + 1}", links = new[] { new { href = "https://untrusted.invalid/orders/ORDE_1" } } }).ToArray();
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(CheckoutJson ?? JsonSerializer.Serialize(new {
                        id = mismatch == "checkout-id" ? "CHEC_other" : "CHEC_1",
                        reference_id = mismatch == "checkout-reference" ? "payment:999" : ChargeReference,
                        orders
                    })) });
                }
                if (request.RequestUri.AbsolutePath == "/orders/ORDE_1")
                {
                    Interlocked.Increment(ref OrderCalls);
                    var charges = Enumerable.Range(0, mismatch == "no-charges" ? 0 : mismatch == "multiple-charges" ? 2 : 1).Select(i => new {
                        id = mismatch == "charge-id" ? "invalid" : $"CHAR_{i + 1}",
                        reference_id = mismatch == "reference" ? "payment:999" : ChargeReference,
                        amount = new { value = mismatch == "amount" ? 1 : AmountInCents, currency = mismatch == "currency" ? "USD" : Currency },
                        links = new[] { new { href = "https://internal.sandbox.api.pagseguro.com/charges/CHAR_1" } }
                    });
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new {
                        id = mismatch == "order-id" ? "ORDE_other" : "ORDE_1",
                        reference_id = mismatch == "order-reference" ? "payment:999" : ChargeReference,
                        charges
                    })) });
                }
                Assert.Equal("/charges/CHAR_1", request.RequestUri.AbsolutePath);
                Interlocked.Increment(ref LookupCalls);
                TransactionObservedDuringLookup = db.Database.CurrentTransaction is not null;
                if (Timeout)
                    throw new TaskCanceledException("simulated timeout");
                return Task.FromResult(new HttpResponseMessage(ResponseStatus)
                {
                    Content = new StringContent(InvalidJson
                        ? "not-json"
                        : JsonSerializer.Serialize(new
                        {
                            id = mismatch == "canonical-id" ? "CHAR_other" : ResponseChargeId,
                            reference_id = ChargeReference,
                            status = ProviderStatus,
                            amount = new
                            {
                                value = AmountInCents,
                                currency = Currency,
                                summary = new
                                {
                                    total = AmountInCents,
                                    refunded = RefundedInCents
                                }
                            },
                            payment_method = new { type = ProviderMethod }
                        }))
                });
            }));
            var service = new PagBankPaymentReconciliationService(
                new PagBankPaymentLookup(http, _options),
                new SynchronizeCheckoutPaymentHandler(
                    new PaymentRepository(db),
                    new OrderRepository(db)
                ),
                db,
                NullLogger<PagBankPaymentReconciliationService>.Instance
            );

            await service.ReconcileAsync(PaymentId);
        }

        public async Task<Payment> Payment()
        {
            await using var db = Open();
            return await db.Payments.SingleAsync(payment => payment.Id == PaymentId);
        }

        public async Task<OrderStatus> GetOrderStatus()
        {
            await using var db = Open();
            return (await db.Orders.SingleAsync()).Status;
        }

        public async Task AssertPending()
        {
            var payment = await Payment();
            Assert.Equal(PaymentStatus.Pending, payment.Status);
            Assert.Equal(PaymentMethod.Unknown, payment.Method);
            Assert.Equal(OrderStatus.PendingPayment, await GetOrderStatus());
        }

        public async Task ApproveLocally()
        {
            await using var db = Open();
            var payment = await db.Payments.SingleAsync(item => item.Id == PaymentId);
            var order = await db.Orders.Include(item => item.Items).SingleAsync();
            payment.SetMethod(PaymentMethod.CreditCard);
            payment.Approve();
            order.MarkAsReceived();
            await db.SaveChangesAsync();
        }

        public async Task SetStatus(PaymentStatus status)
        {
            if (status is PaymentStatus.Refunded or PaymentStatus.ChargedBack)
            {
                await ApproveLocally();
            }

            await using var db = Open();
            var payment = await db.Payments.SingleAsync(item => item.Id == PaymentId);
            if (status == PaymentStatus.Rejected) payment.Reject();
            if (status == PaymentStatus.Cancelled) payment.Cancel();
            if (status == PaymentStatus.Refunded) payment.Refund();
            if (status == PaymentStatus.ChargedBack) payment.ChargeBack();
            await db.SaveChangesAsync();
        }

        public async Task AddFailingOrderTrigger()
        {
            await using var db = Open();
            await db.Database.ExecuteSqlRawAsync(
                "CREATE TRIGGER fail_order BEFORE UPDATE ON Orders " +
                "BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;"
            );
        }

        public void Dispose() => File.Delete(_path);

        private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(
                HttpRequestMessage request,
                CancellationToken cancellationToken) => send(request);
        }
    }
}
