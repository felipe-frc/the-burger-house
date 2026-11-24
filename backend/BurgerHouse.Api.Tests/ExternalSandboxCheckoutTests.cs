using System.Net;
using System.Text.Json;
using BurgerHouse.Api.Controllers;
using BurgerHouse.Application.Payments.CreateHostedCheckout;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Tests;

// Explicit opt-in. Creates one unpaid sandbox checkout in a fresh lab schema, never a charge.
public sealed class ExternalSandboxCheckoutTests
{
    [ExternalSandboxFact]
    public async Task RealSandboxPersistsPendingCheckoutAndReusesItInPostgres()
    {
        var connection = PostgresLab.Create() ?? throw new InvalidOperationException("Isolated PostgreSQL lab required.");
        try
        {
            var guard = new SandboxGuard { InnerHandler = new HttpClientHandler { AllowAutoRedirect = false } };
            using var http = new HttpClient(guard) { Timeout = TimeSpan.FromSeconds(20) };
            var token = Environment.GetEnvironmentVariable("TBH_SANDBOX_TOKEN")!;
            using (var probe = new HttpRequestMessage(HttpMethod.Get, PagBankOptions.SandboxOrigin + "/checkouts/CHEC_" + Guid.NewGuid()))
            {
                probe.Headers.Authorization = new("Bearer", token);
                using var response = await http.SendAsync(probe);
                Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            }
            await using var db = PostgresLab.Open(connection);
            var product = new Product("sandbox-smoke-only", "DEMONSTRACAO LOCAL - SANDBOX", 34.90m);
            db.Products.Add(product); await db.SaveChangesAsync();
            var order = new Order(0, "pickup", "DEMONSTRACAO LOCAL SANDBOX", "11999990000", "sandbox@example.invalid", "52998224725");
            order.AddItem(new OrderItem(product.Id, 1, product.Price));
            db.Orders.Add(order); await db.SaveChangesAsync();
            var gateway = new PagBankCheckoutService(http, Options.Create(new PagBankOptions {
                BaseUrl = PagBankOptions.SandboxOrigin, Token = token, EnablePortfolioSandbox = true,
                RedirectUrl = PagBankOptions.LocalPortfolioReturnUrl, NotificationUrl = ""
            }), new LocalEnvironment());
            var payments = new PaymentRepository(db);
            var handler = new CreateHostedCheckoutHandler(new PrepareCheckoutPaymentHandler(new OrderRepository(db), payments), payments, gateway, new EfUnitOfWork(db));
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
                ["Portfolio:Enabled"] = "true", ["PagBank:EnablePortfolioSandbox"] = "true"
            }).Build();
            var controller = new CheckoutController(handler, configuration: configuration);
            var first = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await controller.CreateCheckoutAsync(order.Id, default)).Value);
            Assert.True(first.GetProperty("keepStoreOpen").GetBoolean());
            Assert.StartsWith("https://pagamento.sandbox.pagbank.com.br/", first.GetProperty("checkoutUrl").GetString());
            var second = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await controller.CreateCheckoutAsync(order.Id, default)).Value);
            Assert.Equal(first.GetProperty("paymentId").GetInt32(), second.GetProperty("paymentId").GetInt32());
            Assert.Equal(1, guard.Creates);
            Assert.Equal(1, await db.Payments.CountAsync());
            var payment = await db.Payments.SingleAsync();
            Assert.Equal(PaymentStatus.Pending, payment.Status);
            Assert.Equal(34.90m, payment.Amount);
            Assert.Equal(OrderStatus.PendingPayment, order.Status);
            await using var reopened = PostgresLab.Open(connection);
            Assert.Equal(payment.ExternalCheckoutId, (await reopened.Payments.SingleAsync()).ExternalCheckoutId);
            Assert.Equal(PaymentStatus.Pending, (await reopened.Payments.SingleAsync()).Status);
        }
        finally
        {
            var settings = new Npgsql.NpgsqlConnectionStringBuilder(connection);
            Assert.Matches("^flow_[a-f0-9]{32}$", settings.SearchPath!);
            using var pg = new Npgsql.NpgsqlConnection(connection); await pg.OpenAsync();
            using var command = new Npgsql.NpgsqlCommand("DROP SCHEMA " + settings.SearchPath + " CASCADE", pg);
            await command.ExecuteNonQueryAsync();
        }
    }
    private sealed class SandboxGuard : DelegatingHandler
    {
        public int Creates;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Assert.Equal("https://sandbox.api.pagseguro.com", request.RequestUri!.GetLeftPart(UriPartial.Authority));
            Assert.StartsWith("/checkouts", request.RequestUri.AbsolutePath);
            Assert.True(request.Method == HttpMethod.Get || request.Method == HttpMethod.Post && request.RequestUri.AbsolutePath == "/checkouts");
            if (request.Method == HttpMethod.Post) Creates++;
            return base.SendAsync(request, ct);
        }
    }
    private sealed class LocalEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Homologation";
        public string ApplicationName { get; set; } = "ExplicitSandboxLab";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
public sealed class ExternalSandboxFactAttribute : FactAttribute
{
    public ExternalSandboxFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("TBH_EXTERNAL_SANDBOX") != "1" ||
            string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TBH_SANDBOX_TOKEN")) ||
            string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TBH_POSTGRES_FLOW")))
            Skip = "Requires explicit sandbox authorization, private sandbox token and isolated PostgreSQL lab.";
    }
}
