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
    public async Task ProviderFailureKeepsPersistedPagBankAttemptForRetry()
    {
        using var fixture = new MercadoPagoWebhooksControllerTests.Fixture();
        await using (var db = fixture.Open())
            await db.Database.ExecuteSqlRawAsync("DELETE FROM Payments");

        for (var attempt = 0; attempt < 2; attempt++)
        {
            await using var db = fixture.Open();
            var gateway = new StubGateway(_ => throw new HttpRequestException("provider rejected request"));
            var controller = CreateController(db, gateway);

            var result = Assert.IsType<ObjectResult>(
                await controller.CreateCheckoutAsync(1, default)
            );

            Assert.Equal(502, result.StatusCode);
            await using var stored = fixture.Open();
            var payment = Assert.Single(await stored.Payments.ToListAsync());
            Assert.True(payment.Id > 0);
            Assert.Equal(PaymentProvider.PagBank, payment.Provider);
            Assert.Equal(PaymentStatus.Pending, payment.Status);
            Assert.Equal(PaymentMethod.Unknown, payment.Method);
            Assert.Null(payment.ExternalCheckoutId);
        }
    }

    [Fact]
    public async Task ConcurrentRequestsCreateOneCheckoutAndReusePersistedIdentity()
    {
        using var fixture = new MercadoPagoWebhooksControllerTests.Fixture();
        await using (var db = fixture.Open())
            await db.Database.ExecuteSqlRawAsync("DELETE FROM Payments");

        var creates = 0;
        var reuses = 0;
        var gateway = new StubGateway(async payment =>
        {
            if (payment.ExternalCheckoutId is null)
            {
                Interlocked.Increment(ref creates);
                Assert.True(payment.Id > 0);
                Assert.Equal(PaymentProvider.PagBank, payment.Provider);
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
            return await CreateController(db, gateway).CreateCheckoutAsync(1, default);
        }

        var results = await Task.WhenAll(Task.Run(Checkout), Task.Run(Checkout));

        Assert.All(results, result =>
        {
            var ok = Assert.IsType<OkObjectResult>(result);
            var body = JsonSerializer.SerializeToElement(ok.Value);
            Assert.Equal(body.GetProperty("checkoutUrl").GetString(), body.GetProperty("initPoint").GetString());
        });
        Assert.Equal(1, creates);
        Assert.Equal(1, reuses);
        var stored = await fixture.Payment();
        Assert.Equal(PaymentProvider.PagBank, stored.Provider);
        Assert.Equal("CHEC_1", stored.ExternalCheckoutId);
        Assert.Null(stored.ExternalPreferenceId);
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
        public PaymentProvider Provider => PaymentProvider.PagBank;

        public Task<HostedCheckoutSession> GetOrCreateAsync(
            Payment payment,
            CancellationToken cancellationToken = default) => getOrCreate(payment);
    }
}
