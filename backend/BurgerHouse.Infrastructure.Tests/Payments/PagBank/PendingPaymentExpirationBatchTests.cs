using System.Net;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Tests.Payments.PagBank;

public class PendingPaymentExpirationBatchTests
{
    [Fact]
    public async Task ExpiresOldPendingOrderWithoutPayment()
    {
        using var fixture = new Fixture();

        var orderId =
            await fixture.CreateOldPendingOrder();

        var expired =
            await fixture.RunBatch();

        Assert.Equal(
            1,
            expired
        );

        Assert.Equal(
            OrderStatus.Cancelled,
            await fixture.GetOrderStatus(orderId)
        );
    }

    [Fact]
    public async Task DoesNotExpireRecentPendingOrder()
    {
        using var fixture = new Fixture();

        var orderId =
            await fixture.CreatePendingOrder();

        var expired =
            await fixture.RunBatch();

        Assert.Equal(
            0,
            expired
        );

        Assert.Equal(
            OrderStatus.PendingPayment,
            await fixture.GetOrderStatus(orderId)
        );
    }

    [Fact]
    public async Task DoesNotExpireOldOrderWithRecentPendingPaymentWithoutCheckout()
    {
        using var fixture = new Fixture();

        var orderId =
            await fixture.CreateOldPendingOrder();

        var paymentId =
            await fixture.CreatePendingPayment(
                orderId
            );

        var expired =
            await fixture.RunBatch();

        Assert.Equal(
            0,
            expired
        );

        Assert.Equal(
            OrderStatus.PendingPayment,
            await fixture.GetOrderStatus(orderId)
        );

        Assert.Equal(
            PaymentStatus.Pending,
            await fixture.GetPaymentStatus(paymentId)
        );
    }

    [Fact]
    public async Task ExpiresOldPendingOrderAndOldPendingPaymentWithoutCheckout()
    {
        using var fixture = new Fixture();

        var orderId =
            await fixture.CreateOldPendingOrder();

        var paymentId =
            await fixture.CreatePendingPayment(
                orderId
            );

        await fixture.MakePaymentOld(
            paymentId
        );

        var expired =
            await fixture.RunBatch();

        Assert.Equal(
            1,
            expired
        );

        Assert.Equal(
            OrderStatus.Cancelled,
            await fixture.GetOrderStatus(orderId)
        );

        Assert.Equal(
            PaymentStatus.Cancelled,
            await fixture.GetPaymentStatus(paymentId)
        );
    }

    [Fact]
    public async Task ExpiresOldPendingOrderWhenPagBankCheckoutIsExpired()
    {
        using var fixture =
            new Fixture(
                checkoutStatus: "EXPIRED"
            );

        var orderId =
            await fixture.CreateOldPendingOrder();

        var paymentId =
            await fixture.CreatePendingPayment(
                orderId,
                "CHEC_1"
            );

        var expired =
            await fixture.RunBatch();

        Assert.Equal(
            1,
            expired
        );

        Assert.Equal(
            OrderStatus.Cancelled,
            await fixture.GetOrderStatus(orderId)
        );

        Assert.Equal(
            PaymentStatus.Cancelled,
            await fixture.GetPaymentStatus(paymentId)
        );
    }

    [Fact]
    public async Task DoesNotExpireOldOrderWhenPagBankCheckoutIsActive()
    {
        using var fixture =
            new Fixture(
                checkoutStatus: "ACTIVE"
            );

        var orderId =
            await fixture.CreateOldPendingOrder();

        var paymentId =
            await fixture.CreatePendingPayment(
                orderId,
                "CHEC_1"
            );

        var expired =
            await fixture.RunBatch();

        Assert.Equal(
            0,
            expired
        );

        Assert.Equal(
            OrderStatus.PendingPayment,
            await fixture.GetOrderStatus(orderId)
        );

        Assert.Equal(
            PaymentStatus.Pending,
            await fixture.GetPaymentStatus(paymentId)
        );
    }

    [Fact]
    public async Task DoesNotExpireOldOrderWhenPagBankLookupFails()
    {
        using var fixture =
            new Fixture(
                responseStatus:
                    HttpStatusCode.ServiceUnavailable
            );

        var orderId =
            await fixture.CreateOldPendingOrder();

        var paymentId =
            await fixture.CreatePendingPayment(
                orderId,
                "CHEC_1"
            );

        var expired =
            await fixture.RunBatch();

        Assert.Equal(
            0,
            expired
        );

        Assert.Equal(
            OrderStatus.PendingPayment,
            await fixture.GetOrderStatus(orderId)
        );

        Assert.Equal(
            PaymentStatus.Pending,
            await fixture.GetPaymentStatus(paymentId)
        );
    }

    [Fact]
    public async Task DoesNotExpireApprovedPayment()
    {
        using var fixture = new Fixture();

        var orderId =
            await fixture.CreateOldPendingOrder();

        var paymentId =
            await fixture.CreateApprovedPayment(
                orderId
            );

        var expired =
            await fixture.RunBatch();

        Assert.Equal(
            0,
            expired
        );

        Assert.Equal(
            OrderStatus.PendingPayment,
            await fixture.GetOrderStatus(orderId)
        );

        Assert.Equal(
            PaymentStatus.Approved,
            await fixture.GetPaymentStatus(paymentId)
        );
    }

    private sealed class Fixture : IDisposable
    {
        private readonly string _path =
            Path.Combine(
                Path.GetTempPath(),
                $"burger-pending-expiration-{Guid.NewGuid()}.db"
            );

        private readonly string _checkoutStatus;

        private readonly HttpStatusCode _responseStatus;

        public Fixture(
            string checkoutStatus = "ACTIVE",
            HttpStatusCode responseStatus = HttpStatusCode.OK)
        {
            _checkoutStatus =
                checkoutStatus;

            _responseStatus =
                responseStatus;

            using var db =
                Open();

            db.Database.EnsureCreated();
        }

        public BurgerHouseDbContext Open()
        {
            return new BurgerHouseDbContext(
                new DbContextOptionsBuilder<BurgerHouseDbContext>()
                    .UseSqlite(
                        $"Data Source={_path};Pooling=False;Default Timeout=10"
                    )
                    .Options,
                TestPersonalData.Protector
            );
        }

        public async Task<int> CreatePendingOrder()
        {
            await using var db =
                Open();

            var order =
                NewOrder();

            db.Orders.Add(
                order
            );

            await db.SaveChangesAsync();

            return order.Id;
        }

        public async Task<int> CreateOldPendingOrder()
        {
            var orderId =
                await CreatePendingOrder();

            await using var db =
                Open();

            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE Orders SET CreatedAt = {DateTime.UtcNow.AddMinutes(-31)} WHERE Id = {orderId}"
            );

            return orderId;
        }

        public async Task MakePaymentOld(
            int paymentId)
        {
            await using var db =
                Open();

            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE Payments SET CreatedAt = {DateTime.UtcNow.AddMinutes(-31)} WHERE Id = {paymentId}"
            );
        }

        public async Task<int> CreatePendingPayment(
            int orderId,
            string? checkoutId = null)
        {
            await using var db =
                Open();

            var order =
                await db.Orders
                    .Include(item => item.Items)
                    .SingleAsync(
                        item => item.Id == orderId
                    );

            var payment =
                new Payment(
                    order.Id,
                    order.Total,
                    Guid.NewGuid().ToString("D"),
                    PaymentMethod.Unknown
                );

            if (checkoutId is not null)
            {
                payment.SetExternalCheckoutId(
                    checkoutId
                );
            }

            db.Payments.Add(
                payment
            );

            await db.SaveChangesAsync();

            return payment.Id;
        }

        public async Task<int> CreateApprovedPayment(
            int orderId)
        {
            await using var db =
                Open();

            var order =
                await db.Orders
                    .Include(item => item.Items)
                    .SingleAsync(
                        item => item.Id == orderId
                    );

            var payment =
                new Payment(
                    order.Id,
                    order.Total,
                    Guid.NewGuid().ToString("D"),
                    PaymentMethod.CreditCard
                );

            payment.Approve();

            db.Payments.Add(
                payment
            );

            await db.SaveChangesAsync();

            return payment.Id;
        }

        public async Task<int> RunBatch()
        {
            await using var db =
                Open();

            using var http =
                new HttpClient(
                    new Stub(request =>
                    {
                        if (_responseStatus != HttpStatusCode.OK)
                        {
                            return Task.FromResult(
                                Json(
                                    _responseStatus,
                                    "{}"
                                )
                            );
                        }

                        Assert.Equal(
                            "/checkouts/CHEC_1",
                            request.RequestUri!.AbsolutePath
                        );

                        return Task.FromResult(
                            Json(
                                HttpStatusCode.OK,
                                $$"""
                                {
                                  "id":"CHEC_1",
                                  "reference_id":"payment:{{GetPaymentId(db)}}",
                                  "status":"{{_checkoutStatus}}"
                                }
                                """
                            )
                        );
                    })
                );

            var lookup =
                new PagBankPaymentLookup(
                    http,
                    Options.Create(
                        new PagBankOptions
                        {
                            BaseUrl =
                                "https://sandbox.api.pagseguro.com",

                            Token =
                                "local-test-token",

                            CheckoutExpirationMinutes =
                                30
                        }
                    )
                );

            var batch =
                new PendingPaymentExpirationBatch(
                    db,
                    lookup,
                    Options.Create(
                        new PagBankOptions
                        {
                            CheckoutExpirationMinutes =
                                30
                        }
                    ),
                    NullLogger<PendingPaymentExpirationBatch>.Instance
                );

            return await batch.RunAsync();
        }

        public async Task<OrderStatus> GetOrderStatus(
            int orderId)
        {
            await using var db =
                Open();

            return await db.Orders
                .Where(order =>
                    order.Id == orderId
                )
                .Select(order =>
                    order.Status
                )
                .SingleAsync();
        }

        public async Task<PaymentStatus> GetPaymentStatus(
            int paymentId)
        {
            await using var db =
                Open();

            return await db.Payments
                .Where(payment =>
                    payment.Id == paymentId
                )
                .Select(payment =>
                    payment.Status
                )
                .SingleAsync();
        }

        private static int GetPaymentId(
            BurgerHouseDbContext db)
        {
            return db.Payments
                .AsNoTracking()
                .Select(payment =>
                    payment.Id
                )
                .Single();
        }

        private static Order NewOrder()
        {
            var order =
                new Order(
                    0,
                    "pickup",
                    "Cliente Teste",
                    "11999990000",
                    "cliente@teste.com",
                    "52998224725"
                );

            order.AddItem(
                new OrderItem(
                    1,
                    1,
                    43.90m
                )
            );

            return order;
        }

        private static HttpResponseMessage Json(
            HttpStatusCode status,
            string value)
        {
            return new HttpResponseMessage(
                status
            )
            {
                Content =
                    new StringContent(
                        value,
                        System.Text.Encoding.UTF8,
                        "application/json"
                    )
            };
        }

        public void Dispose()
        {
            foreach (var file in new[]
                     {
                         _path,
                         _path + "-wal",
                         _path + "-shm"
                     })
            {
                File.Delete(file);
            }
        }

        private sealed class Stub(
            Func<
                HttpRequestMessage,
                Task<HttpResponseMessage>
            > send)
            : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(
                HttpRequestMessage request,
                CancellationToken cancellationToken)
            {
                return send(
                    request
                );
            }
        }
    }
}