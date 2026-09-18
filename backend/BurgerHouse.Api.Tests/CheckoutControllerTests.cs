using System.Net;
using System.Text.Json;
using BurgerHouse.Api.Controllers;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Tests;

public class CheckoutControllerTests
{
    [Fact]
    public async Task ProviderFailureKeepsPersistedAttemptForRetry()
    {
        using var fixture = new MercadoPagoWebhooksControllerTests.Fixture();
        await using (var db = fixture.Open())
            await db.Database.ExecuteSqlRawAsync("DELETE FROM Payments");
        for (var attempt = 0; attempt < 2; attempt++)
        {
            await using var db = fixture.Open();
            using var http = new HttpClient(new Stub(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadRequest)
            {
                Content = new StringContent("""{"message":"invalid request","error":"bad_request","status":400,"cause":[]}""")
            })));
            var service = new MercadoPagoPreferenceService(http, Options.Create(new MercadoPagoOptions { AccessToken = "local-test-token" }));
            var controller = new CheckoutController(new PrepareCheckoutPaymentHandler(new OrderRepository(db), new PaymentRepository(db)), service, db);
            var result = Assert.IsType<ObjectResult>(await controller.CreatePreferenceAsync(1, default));
            Assert.Equal(502, result.StatusCode);
            await using var stored = fixture.Open();
            var payment = Assert.Single(await stored.Payments.ToListAsync());
            Assert.True(payment.Id > 0);
            Assert.Equal(Domain.Enums.PaymentStatus.Pending, payment.Status);
            Assert.Equal(Domain.Enums.PaymentMethod.Unknown, payment.Method);
            Assert.Null(payment.ExternalPreferenceId);
        }
    }

    [Fact]
    public async Task ConcurrentRequestsCreateOnePreferenceAndReusePersistedIdentity()
    {
        using var fixture = new MercadoPagoWebhooksControllerTests.Fixture();
        await using (var db = fixture.Open())
            await db.Database.ExecuteSqlRawAsync("UPDATE Payments SET ExternalPreferenceId = NULL");
        var posts = 0;
        var gets = 0;
        async Task<IActionResult> Checkout()
        {
            await using var db = fixture.Open();
            using var http = new HttpClient(new Stub(async request =>
            {
                if (request.Method == HttpMethod.Post)
                {
                    Interlocked.Increment(ref posts);
                    using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
                    Assert.Equal("1", body.RootElement.GetProperty("external_reference").GetString());
                    // The identity exists outside the controller's transaction before the provider receives it.
                    Assert.Equal(1, (await fixture.Payment()).Id);
                }
                else Interlocked.Increment(ref gets);
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("""{"id":"pref-1","external_reference":"1","init_point":"https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1","expires":false}""") };
            }));
            var service = new MercadoPagoPreferenceService(http, Options.Create(new MercadoPagoOptions { AccessToken = "local-test-token" }));
            var controller = new CheckoutController(new PrepareCheckoutPaymentHandler(new OrderRepository(db), new PaymentRepository(db)), service, db);
            return await controller.CreatePreferenceAsync(1, default);
        }
        var results = await Task.WhenAll(Task.Run(Checkout), Task.Run(Checkout));
        Assert.All(results, result => Assert.IsType<OkObjectResult>(result));
        Assert.Equal(1, posts);
        Assert.Equal(1, gets);
        Assert.Equal("pref-1", (await fixture.Payment()).ExternalPreferenceId);
    }

    private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request);
    }
}
