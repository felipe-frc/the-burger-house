using System.Text.Json;
using BurgerHouse.Api.Controllers;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Tests;

public class CheckoutControllerTests
{
    [Fact]
    public async Task ProviderFailureKeepsPersistedAttemptForRetry()
    {
        using var fixture = new Fixture();

        for (var attempt = 0; attempt < 2; attempt++)
        {
            await using var db = fixture.Open();
            var gateway = new StubGateway(_ => throw new HttpRequestException("provider rejected request"));
            var controller = CreateController(db, gateway);

            var result = Assert.IsType<ObjectResult>(
                await controller.CreateCheckoutAsync(fixture.OrderId, default)
            );

            Assert.Equal(502, result.StatusCode);
            var payment = await fixture.Payment();
            Assert.True(payment.Id > 0);
            Assert.Equal(PaymentStatus.Pending, payment.Status);
            Assert.Equal(PaymentMethod.Unknown, payment.Method);
            Assert.Null(payment.ExternalCheckoutId);
        }
    }

    [Fact]
    public async Task ConcurrentRequestsCreateOneCheckoutAndReturnFinalContract()
    {
        using var fixture = new Fixture();
        var creates = 0;
        var reuses = 0;
        var gateway = new StubGateway(async payment =>
        {
            if (payment.ExternalCheckoutId is null)
            {
                Interlocked.Increment(ref creates);
                Assert.True(payment.Id > 0);
                Assert.Equal(payment.Id, (await fixture.Payment()).Id);
                payment.SetExternalCheckoutId("CHEC_1");
            }
            else
            {
                Interlocked.Increment(ref reuses);
            }

            return new HostedCheckoutSession(
                payment.Id,
                payment.ExternalCheckoutId!,
                "https://pagamento.pagbank.com.br/checkout/CHEC_1"
            );
        });

        async Task<IActionResult> Checkout()
        {
            await using var db = fixture.Open();
            return await CreateController(db, gateway).CreateCheckoutAsync(fixture.OrderId, default);
        }

        var results = await Task.WhenAll(Task.Run(Checkout), Task.Run(Checkout));

        Assert.All(results, result =>
        {
            var body = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result).Value);
            Assert.True(body.GetProperty("paymentId").GetInt32() > 0);
            Assert.Equal(
                "https://pagamento.pagbank.com.br/checkout/CHEC_1",
                body.GetProperty("checkoutUrl").GetString()
            );
            Assert.False(body.TryGetProperty("initPoint", out _));
        });
        Assert.Equal(1, creates);
        Assert.Equal(1, reuses);
        Assert.Equal("CHEC_1", (await fixture.Payment()).ExternalCheckoutId);
    }

    private static CheckoutController CreateController(
        BurgerHouseDbContext db,
        IHostedCheckoutGateway gateway) =>
        new(
            new PrepareCheckoutPaymentHandler(new OrderRepository(db), new PaymentRepository(db)),
            gateway,
            db
        );

    private sealed class StubGateway(
        Func<Payment, Task<HostedCheckoutSession>> getOrCreate) : IHostedCheckoutGateway
    {
        public Task<HostedCheckoutSession> GetOrCreateAsync(
            Payment payment,
            CancellationToken cancellationToken = default) => getOrCreate(payment);
    }

    private sealed class Fixture : IDisposable
    {
        private readonly string _path = Path.Combine(
            Path.GetTempPath(),
            $"burger-checkout-controller-{Guid.NewGuid()}.db"
        );

        public int OrderId { get; }

        public Fixture()
        {
            using var db = Open();
            db.Database.EnsureCreated();
            var order = new Order(0, "pickup", "Cliente Teste", "11999990000", "cliente@teste.com", "52998224725");
            order.AddItem(new OrderItem(1, 1, 43.90m));
            db.Orders.Add(order);
            db.SaveChanges();
            OrderId = order.Id;
        }

        public BurgerHouseDbContext Open() => new(
            new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite($"Data Source={_path};Pooling=False;Default Timeout=10")
                .Options
        );

        public async Task<Payment> Payment()
        {
            await using var db = Open();
            return await db.Payments.SingleAsync();
        }

        public void Dispose() => File.Delete(_path);
    }
}
