using System.Net;
using System.Text.Json;
using BurgerHouse.Api.Controllers;
using BurgerHouse.Application.Payments.GetPaymentStatus;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Tests;

public class PagBankPaymentStatusReconciliationControllerTests
{
    [Fact]
    public async Task GetStatusReconcilesPaidPagBankCheckoutAndPreservesResponseContract()
    {
        var path = Path.Combine(
            Path.GetTempPath(),
            $"burger-pagbank-status-controller-{Guid.NewGuid()}.db"
        );
        try
        {
            var dbOptions = new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite($"Data Source={path};Pooling=False")
                .Options;
            int paymentId;
            await using (var setup = new BurgerHouseDbContext(dbOptions))
            {
                await setup.Database.EnsureCreatedAsync();
                var order = new Order(0);
                order.AddItem(new OrderItem(1, 1, 43.90m));
                setup.Orders.Add(order);
                await setup.SaveChangesAsync();
                var payment = new Payment(
                    order.Id,
                    order.Total,
                    Guid.NewGuid().ToString("D"),
                    PaymentMethod.Unknown,
                    PaymentProvider.PagBank
                );
                setup.Payments.Add(payment);
                await setup.SaveChangesAsync();
                payment.SetExternalCheckoutId("CHEC_1");
                await setup.SaveChangesAsync();
                paymentId = payment.Id;
            }

            await using var db = new BurgerHouseDbContext(dbOptions);
            using var http = new HttpClient(new Stub(_ => Task.FromResult(
                new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(JsonSerializer.Serialize(new
                    {
                        id = "CHEC_1",
                        reference_id = $"payment:{paymentId}",
                        charges = new[]
                        {
                            new
                            {
                                id = "CHAR_1",
                                reference_id = $"payment:{paymentId}",
                                status = "PAID",
                                amount = new
                                {
                                    value = 4390,
                                    currency = "BRL",
                                    summary = new { total = 4390, refunded = 0 }
                                },
                                payment_method = new { type = "CREDIT_CARD" }
                            }
                        }
                    }))
                }
            )));
            var pagBankOptions = Options.Create(new PagBankOptions
            {
                BaseUrl = "https://sandbox.api.pagseguro.com",
                Token = "local-test-token"
            });
            var paymentRepository = new PaymentRepository(db);
            var orderRepository = new OrderRepository(db);
            var reconciliation = new PagBankPaymentReconciliationService(
                new PagBankCheckoutLookup(http, pagBankOptions),
                new SynchronizeCheckoutPaymentHandler(paymentRepository, orderRepository),
                db,
                NullLogger<PagBankPaymentReconciliationService>.Instance
            );
            var controller = new PaymentsController(
                new GetPaymentStatusHandler(paymentRepository, reconciliation)
            );

            var result = await controller.GetStatusAsync(paymentId, CancellationToken.None);

            var response = Assert.IsType<GetPaymentStatusResponse>(
                Assert.IsType<OkObjectResult>(result.Result).Value
            );
            Assert.Equal(paymentId, response.PaymentId);
            Assert.Equal(PaymentStatus.Approved, response.Status);
            Assert.Equal(PaymentMethod.CreditCard, response.Method);
            db.ChangeTracker.Clear();
            var persistedPayment = await db.Payments.SingleAsync(item => item.Id == paymentId);
            Assert.Equal("CHAR_1", persistedPayment.ExternalPaymentId);
            Assert.Equal(OrderStatus.Received, (await db.Orders.SingleAsync()).Status);
        }
        finally
        {
            File.Delete(path);
        }
    }

    private sealed class Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) => send(request);
    }
}
