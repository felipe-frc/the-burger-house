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
    public async Task PaidCheckoutApprovesPaymentStoresChargeAndUpdatesOrder()
    {
        using var fixture = new Fixture();
        fixture.ProviderStatus = "PAID";
        fixture.ProviderMethod = "CREDIT_CARD";

        await fixture.Reconcile();

        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.Equal(PaymentMethod.CreditCard, payment.Method);
        Assert.Equal("CHAR_1", payment.ExternalPaymentId);
        Assert.Equal(OrderStatus.Received, await fixture.GetOrderStatus());
        Assert.False(fixture.TransactionObservedDuringLookup);
    }

    [Theory]
    [InlineData("WAITING", "BOLETO", PaymentStatus.Pending)]
    [InlineData("DECLINED", "PIX", PaymentStatus.Rejected)]
    [InlineData("CANCELED", "PIX", PaymentStatus.Cancelled)]
    public async Task MapsNonSettledCheckoutStatuses(
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

        var payment = await fixture.Payment();
        Assert.Equal(expectedStatus, payment.Status);
        Assert.Equal("CHAR_1", payment.ExternalPaymentId);
        Assert.Equal(OrderStatus.PendingPayment, await fixture.GetOrderStatus());
    }

    [Fact]
    public async Task ApprovedPagBankPaymentDoesNotCallProvider()
    {
        using var fixture = new Fixture();
        await fixture.ApproveLocally();

        await fixture.Reconcile();

        Assert.Equal(0, fixture.LookupCalls);
    }

    [Fact]
    public async Task MercadoPagoPaymentDoesNotCallPagBank()
    {
        using var fixture = new Fixture(PaymentProvider.MercadoPago);

        await fixture.Reconcile();

        Assert.Equal(0, fixture.LookupCalls);
        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
    }

    [Fact]
    public async Task MissingExternalCheckoutIdDoesNotCallProvider()
    {
        using var fixture = new Fixture(setCheckoutId: false);

        await fixture.Reconcile();

        Assert.Equal(0, fixture.LookupCalls);
        Assert.Equal(PaymentStatus.Pending, (await fixture.Payment()).Status);
    }

    [Theory]
    [InlineData("checkout-id")]
    [InlineData("checkout-reference")]
    [InlineData("charge-reference")]
    [InlineData("amount")]
    [InlineData("currency")]
    [InlineData("missing-charge")]
    [InlineData("duplicate-charge")]
    public async Task CorrelationMismatchDoesNotUpdate(string mismatch)
    {
        using var fixture = new Fixture();
        if (mismatch == "checkout-id") fixture.ResponseCheckoutId = "CHEC_other";
        if (mismatch == "checkout-reference") fixture.CheckoutReference = "payment:999";
        if (mismatch == "charge-reference") fixture.ChargeReference = "payment:999";
        if (mismatch == "amount") fixture.AmountInCents = 100;
        if (mismatch == "currency") fixture.Currency = "USD";
        if (mismatch == "missing-charge") fixture.ChargeCount = 0;
        if (mismatch == "duplicate-charge") fixture.ChargeCount = 2;

        await fixture.Reconcile();

        await fixture.AssertUnchanged();
    }

    [Fact]
    public async Task ExistingDifferentExternalPaymentIdIsNeverReplaced()
    {
        using var fixture = new Fixture();
        await fixture.SetExternalPaymentId("CHAR_old");

        await fixture.Reconcile();

        var payment = await fixture.Payment();
        Assert.Equal("CHAR_old", payment.ExternalPaymentId);
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Equal(PaymentMethod.Unknown, payment.Method);
    }

    [Fact]
    public async Task UnknownProviderStatusDoesNotUpdate()
    {
        using var fixture = new Fixture { ProviderStatus = "UNKNOWN" };

        await fixture.Reconcile();

        await fixture.AssertUnchanged();
    }

    [Fact]
    public async Task UnknownMethodOnPaidChargeDoesNotApprove()
    {
        using var fixture = new Fixture
        {
            ProviderStatus = "PAID",
            ProviderMethod = "BOLETO"
        };

        await fixture.Reconcile();

        await fixture.AssertUnchanged();
    }

    [Fact]
    public async Task ProviderErrorKeepsLocalState()
    {
        using var fixture = new Fixture { ResponseStatus = HttpStatusCode.InternalServerError };

        await fixture.Reconcile();

        await fixture.AssertUnchanged();
    }

    [Fact]
    public async Task ProviderTimeoutKeepsLocalState()
    {
        using var fixture = new Fixture { Timeout = true };

        await fixture.Reconcile();

        await fixture.AssertUnchanged();
    }

    [Fact]
    public async Task WebhookUpdateBeforeFallbackMakesFallbackANoOp()
    {
        using var fixture = new Fixture();
        await fixture.ApproveLocally();
        var updatedAt = (await fixture.Payment()).UpdatedAt;

        await fixture.Reconcile();

        Assert.Equal(0, fixture.LookupCalls);
        Assert.Equal(updatedAt, (await fixture.Payment()).UpdatedAt);
        Assert.Equal(OrderStatus.Received, await fixture.GetOrderStatus());
    }

    [Fact]
    public async Task WebhookAfterFallbackIsIdempotent()
    {
        using var fixture = new Fixture();
        await fixture.Reconcile();
        var updatedAt = (await fixture.Payment()).UpdatedAt;

        Assert.False(await fixture.SynchronizeLikeWebhook());

        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.Equal(updatedAt, payment.UpdatedAt);
        Assert.Equal(OrderStatus.Received, await fixture.GetOrderStatus());
    }

    [Fact]
    public async Task PaymentAndOrderRollBackTogetherWhenOrderWriteFails()
    {
        using var fixture = new Fixture();
        await fixture.AddFailingOrderTrigger();

        await fixture.Reconcile();

        await fixture.AssertUnchanged();
    }

    [Fact]
    public async Task ConcurrentFallbacksLeaveOneConsistentResult()
    {
        using var fixture = new Fixture();

        await Task.WhenAll(fixture.Reconcile(), fixture.Reconcile());

        var payment = await fixture.Payment();
        Assert.Equal(PaymentStatus.Approved, payment.Status);
        Assert.Equal(PaymentMethod.CreditCard, payment.Method);
        Assert.Equal("CHAR_1", payment.ExternalPaymentId);
        Assert.Equal(OrderStatus.Received, await fixture.GetOrderStatus());
    }

    private sealed class Fixture : IDisposable
    {
        private readonly string _path = Path.Combine(
            Path.GetTempPath(),
            $"burger-pagbank-reconciliation-{Guid.NewGuid()}.db"
        );
        private readonly IOptions<PagBankOptions> _options = Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com",
            Token = "local-test-token"
        });

        public int PaymentId { get; }
        public int LookupCalls;
        public bool TransactionObservedDuringLookup;
        public bool Timeout;
        public HttpStatusCode ResponseStatus = HttpStatusCode.OK;
        public string ResponseCheckoutId = "CHEC_1";
        public string CheckoutReference { get; set; }
        public string ChargeReference { get; set; }
        public string ProviderStatus = "PAID";
        public string ProviderMethod = "CREDIT_CARD";
        public string Currency = "BRL";
        public int AmountInCents = 4390;
        public int ChargeCount = 1;

        public Fixture(
            PaymentProvider provider = PaymentProvider.PagBank,
            bool setCheckoutId = true)
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
                PaymentMethod.Unknown,
                provider
            );
            db.Payments.Add(payment);
            db.SaveChanges();
            if (provider == PaymentProvider.PagBank && setCheckoutId)
                payment.SetExternalCheckoutId("CHEC_1");
            if (provider == PaymentProvider.MercadoPago)
                payment.SetExternalPreferenceId("PREF_1");
            db.SaveChanges();

            PaymentId = payment.Id;
            CheckoutReference = $"payment:{PaymentId}";
            ChargeReference = CheckoutReference;
        }

        public BurgerHouseDbContext Open() => new(
            new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite($"Data Source={_path};Pooling=False;Default Timeout=10")
                .Options
        );

        public async Task Reconcile()
        {
            await using var db = Open();
            using var http = new HttpClient(new Stub(_ =>
            {
                Interlocked.Increment(ref LookupCalls);
                TransactionObservedDuringLookup = db.Database.CurrentTransaction is not null;
                if (Timeout)
                    throw new TaskCanceledException("simulated timeout");

                var charges = Enumerable.Range(0, ChargeCount)
                    .Select(index => new
                    {
                        id = index == 0 ? "CHAR_1" : $"CHAR_{index + 1}",
                        reference_id = ChargeReference,
                        status = ProviderStatus,
                        amount = new
                        {
                            value = AmountInCents,
                            currency = Currency,
                            summary = new { total = AmountInCents, refunded = 0 }
                        },
                        payment_method = new { type = ProviderMethod }
                    })
                    .ToArray();
                return Task.FromResult(new HttpResponseMessage(ResponseStatus)
                {
                    Content = new StringContent(JsonSerializer.Serialize(new
                    {
                        id = ResponseCheckoutId,
                        reference_id = CheckoutReference,
                        charges
                    }))
                });
            }));
            var service = new PagBankPaymentReconciliationService(
                new PagBankCheckoutLookup(http, _options),
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

        public async Task AssertUnchanged()
        {
            var payment = await Payment();
            Assert.Equal(PaymentStatus.Pending, payment.Status);
            Assert.Equal(PaymentMethod.Unknown, payment.Method);
            Assert.Null(payment.ExternalPaymentId);
            Assert.Equal(OrderStatus.PendingPayment, await GetOrderStatus());
        }

        public async Task SetExternalPaymentId(string id)
        {
            await using var db = Open();
            var payment = await db.Payments.SingleAsync(item => item.Id == PaymentId);
            payment.SetExternalPaymentId(id);
            await db.SaveChangesAsync();
        }

        public async Task ApproveLocally()
        {
            await using var db = Open();
            var payment = await db.Payments.SingleAsync(item => item.Id == PaymentId);
            var order = await db.Orders.Include(item => item.Items).SingleAsync();
            payment.SetMethod(PaymentMethod.CreditCard);
            payment.SetExternalPaymentId("CHAR_1");
            payment.Approve();
            order.MarkAsReceived();
            await db.SaveChangesAsync();
        }

        public async Task<bool> SynchronizeLikeWebhook()
        {
            await using var db = Open();
            var handler = new SynchronizeCheckoutPaymentHandler(
                new PaymentRepository(db),
                new OrderRepository(db)
            );
            return await handler.HandleAsync(
                PaymentId,
                PaymentProvider.PagBank,
                "CHAR_1",
                43.90m,
                "BRL",
                PaymentMethod.CreditCard,
                BurgerHouse.Application.Abstractions.Payments.PaymentGatewayStatus.Approved
            );
        }

        public async Task AddFailingOrderTrigger()
        {
            await using var db = Open();
            await db.Database.ExecuteSqlRawAsync(
                "CREATE TRIGGER fail_order BEFORE UPDATE ON Orders " +
                "BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;"
            );
        }

        public void Dispose()
        {
            File.Delete(_path);
        }

        private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(
                HttpRequestMessage request,
                CancellationToken cancellationToken) => send(request);
        }
    }
}
