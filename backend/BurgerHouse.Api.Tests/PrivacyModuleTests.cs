using System.Net;
using System.Net.Http.Json;
using BurgerHouse.Api.Privacy;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Privacy;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;
using BurgerHouse.Api.Security;
using BurgerHouse.Application.Admin;

namespace BurgerHouse.Api.Tests;

public sealed class PrivacyModuleTests
{
    [Fact]
    public async Task HttpRequestsRequireOwnProofAndOwnerCsrfAndHandleRevisionConflicts()
    {
        var file = Path.Combine(Path.GetTempPath(), $"privacy-http-{Guid.NewGuid()}.db");
        var pg = TestDatabase.PrepareOperational(file);
        using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => {
            builder.UseEnvironment("IntegrationTest"); builder.UseSetting("Database:Provider", pg is null ? "Sqlite" : "PostgreSQL");
            builder.UseSetting("ConnectionStrings:DefaultConnection", pg ?? $"Data Source={file};Pooling=False");
            builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
            builder.UseSetting("Privacy:RequestsEnabled", "true"); builder.UseSetting("Privacy:ControllerName", "Synthetic controller");
            builder.UseSetting("Privacy:PrivacyContact", "privacy@example.invalid"); builder.UseSetting("Privacy:RetentionPolicyVersion", "test-only");
            builder.UseSetting("PagBank:Token", "synthetic-not-a-credential"); builder.ConfigureLogging(logging => logging.ClearProviders());
        });
        try {
            using var client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
            var password = "Synthetic-only-" + Guid.NewGuid(); int orderId; string proof;
            using (var scope = app.Services.CreateScope()) {
                await scope.ServiceProvider.GetRequiredService<PrivacyDbContext>().Database.MigrateAsync();
                var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
                var order = new Order(0, "pickup", "Titular sintético", "11999990000", "synthetic@example.invalid", "52998224725");
                order.CancelPendingPayment(); db.Orders.Add(order); await db.SaveChangesAsync(); orderId = order.Id;
                proof = scope.ServiceProvider.GetRequiredService<PublicOrderAccess>().Issue(orderId);
                await scope.ServiceProvider.GetRequiredService<IAdminIdentity>().CreateFirstOwnerAsync("privacy-owner@example.invalid", password, default);
            }
            var id = Guid.NewGuid(); var body = new { id, orderId, kind = "erasure" };
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/privacy/requests", body)).StatusCode);
            client.DefaultRequestHeaders.Add(PublicOrderAccess.Header, proof);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/privacy/requests", body)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/privacy/requests", body)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/privacy/orders/{orderId + 1}/export")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/privacy/orders/{orderId}/export")).StatusCode);
            var csrf = await client.GetFromJsonAsync<JsonElement>("/api/admin/auth/login");
            client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.GetProperty("csrfToken").GetString());
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/admin/auth/login", new { email = "privacy-owner@example.invalid", password })).StatusCode);
            client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
            var review = new { revision = 0, action = "MinimizeContact", retentionReviewed = true, confirmation = "MINIMIZAR" };
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/admin/privacy/requests/{id}/review", review)).StatusCode);
            csrf = await client.GetFromJsonAsync<JsonElement>("/api/admin/auth/me");
            client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.GetProperty("csrfToken").GetString());
            Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync($"/api/admin/privacy/requests/{id}/review", review)).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/admin/privacy/requests/{id}/review", review)).StatusCode);
            var status = await client.GetFromJsonAsync<JsonElement>($"/api/privacy/requests/{id}");
            Assert.Equal("Processed", status.GetProperty("state").GetString());
            using var anonymous = app.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/privacy/requests/{id}")).StatusCode);
            for (var i = 0; i < 120; i++)
                Assert.Equal(HttpStatusCode.NotFound, (await anonymous.PostAsync($"/api/checkout/{orderId}", null)).StatusCode);
            Assert.Equal(HttpStatusCode.TooManyRequests, (await anonymous.PostAsync($"/api/checkout/{orderId}", null)).StatusCode);
        } finally { SqliteConnection.ClearAllPools(); if (File.Exists(file)) File.Delete(file); }
    }

    [Fact]
    public async Task MigrationEncryptionIdempotencyAndMinimizationPreserveOperationalRecords()
    {
        await using var fixture = await Fixture.Create();
        var order = await fixture.Order(terminal: true);
        var before = order.Total;
        var correction = await fixture.Service.Submit(new(Guid.NewGuid(), order.Id, "correction", new("Titular sintético corrigido", "11999990001", "corrected@example.invalid")), default);
        Assert.DoesNotContain("example.invalid", correction.EncryptedCorrection!);
        Assert.DoesNotContain("sintético", correction.EncryptedCorrection!);
        Assert.StartsWith("enc:", correction.EncryptedCorrection!);
        Assert.Equal(correction.Id, (await fixture.Service.Submit(new(correction.Id, order.Id, "correction", new("Outro nome sintético", "11999990002", "other@example.invalid")), default)).Id);
        Assert.Equal(1, await fixture.Privacy.Requests.CountAsync());
        await fixture.Service.Review(correction.Id, new(0, "ApplyCorrection", true, null), 1, default);
        Assert.Equal("Titular sintético corrigido", order.CustomerName);
        Assert.Equal(before, order.Total);
        Assert.Null(correction.EncryptedCorrection);
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => fixture.Service.Review(correction.Id, new(0, "ApplyCorrection", true, null), 2, default));
        fixture.Privacy.ChangeTracker.Clear(); fixture.Operational.ChangeTracker.Clear();
        var erase = await fixture.Service.Submit(new(Guid.NewGuid(), order.Id, "erasure", null), default);
        await fixture.Service.Review(erase.Id, new(0, "MinimizeContact", true, "MINIMIZAR"), 1, default);
        fixture.Operational.ChangeTracker.Clear();
        var saved = await fixture.Operational.Orders.Include(x => x.Items).SingleAsync(x => x.Id == order.Id);
        Assert.Equal("Titular minimizado", saved.CustomerName);
        Assert.Null(saved.CustomerEmail); Assert.Null(saved.CustomerTaxId); Assert.Equal("", saved.CustomerPhone);
        Assert.All(saved.Items, x => Assert.Null(x.Observation));
        Assert.Equal(before, saved.Total); Assert.Equal(OrderStatus.Cancelled, saved.Status);
        Assert.Equal(1, await fixture.Operational.Orders.CountAsync());
        Assert.True(await fixture.Service.Available(default));
        Assert.Empty(await fixture.Operational.Database.GetPendingMigrationsAsync());
    }

    [Theory]
    [InlineData(false, false, true, "MINIMIZAR")]
    [InlineData(true, true, true, "MINIMIZAR")]
    [InlineData(true, false, false, "MINIMIZAR")]
    [InlineData(true, false, true, "")]
    public async Task RejectsUnsafeMinimizationWithoutChangingOrders(bool terminal, bool pendingPayment, bool retention, string confirmation)
    {
        await using var fixture = await Fixture.Create();
        var order = await fixture.Order(terminal);
        if (pendingPayment) {
            fixture.Operational.Payments.Add(new Payment(order.Id, order.Total, Guid.NewGuid().ToString(), PaymentMethod.Pix));
            await fixture.Operational.SaveChangesAsync();
        }
        var request = await fixture.Service.Submit(new(Guid.NewGuid(), order.Id, "erasure", null), default);
        await Assert.ThrowsAnyAsync<Exception>(() => fixture.Service.Review(request.Id, new(0, "MinimizeContact", retention, confirmation), 1, default));
        fixture.Operational.ChangeTracker.Clear(); fixture.Privacy.ChangeTracker.Clear();
        Assert.Equal("Titular sintético", (await fixture.Operational.Orders.SingleAsync(x => x.Id == order.Id)).CustomerName);
        Assert.Equal("Received", (await fixture.Privacy.Requests.SingleAsync()).State);
    }

    [Fact]
    public async Task DisabledModuleFailsClosedAndPublicRoutesCannotUseNumericIdentity()
    {
        var file = Path.Combine(Path.GetTempPath(), $"privacy-api-{Guid.NewGuid()}.db");
        TestDatabase.Prepare(file);
        using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder => {
            builder.UseEnvironment("IntegrationTest"); builder.UseSetting("Database:Provider", "Sqlite");
            builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={file};Pooling=False");
            builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
            builder.UseSetting("Privacy:RequestsEnabled", "false");
            builder.UseSetting("PagBank:Token", "synthetic-not-a-credential");
            builder.ConfigureLogging(logging => logging.ClearProviders());
        });
        try {
            using var http = app.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
            var config = await http.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/privacy/config");
            Assert.False(config.GetProperty("requestsEnabled").GetBoolean());
            Assert.Equal(HttpStatusCode.NotFound, (await http.PostAsJsonAsync("/api/privacy/requests", new { id = Guid.NewGuid(), orderId = 1, kind = "erasure" })).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync("/api/privacy/orders/1/export")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/admin/privacy/requests")).StatusCode);
        } finally { SqliteConnection.ClearAllPools(); File.Delete(file); }
    }

    private sealed class Fixture(BurgerHouseDbContext operational, PrivacyDbContext privacy) : IAsyncDisposable
    {
        public BurgerHouseDbContext Operational => operational;
        public PrivacyDbContext Privacy => privacy;
        public PrivacyService Service { get; } = new(privacy, operational, TestPersonalData.Protector, TimeProvider.System,
            Options.Create(new PrivacyOptions { RequestsEnabled = true, ControllerName = "Controlador de teste", PrivacyContact = "privacy@example.invalid", RetentionPolicyVersion = "test-only" }));
        public static async Task<Fixture> Create()
        {
            var pg = PostgresLab.Create();
            BurgerHouseDbContext operational;
            if (pg is not null) operational = PostgresLab.Open(pg);
            else {
                var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
                operational = new BurgerHouseDbContext(new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(connection).Options, TestPersonalData.Protector);
                await operational.Database.MigrateAsync();
            }
            var options = new DbContextOptionsBuilder<PrivacyDbContext>();
            if (pg is not null) options.UseNpgsql(operational.Database.GetDbConnection(), x => x.MigrationsHistoryTable("__PrivacyEFMigrationsHistory"));
            else options.UseSqlite(operational.Database.GetDbConnection(), x => x.MigrationsHistoryTable("__PrivacyEFMigrationsHistory"));
            var privacy = new PrivacyDbContext(options.Options);
            await privacy.Database.MigrateAsync();
            return new(operational, privacy);
        }
        public async Task<Order> Order(bool terminal)
        {
            var product = new Product("privacy-synthetic", "Produto sintético", 12m);
            operational.Products.Add(product); await operational.SaveChangesAsync();
            var order = new Order(0, "pickup", "Titular sintético", "11999990000", "synthetic@example.invalid", "52998224725", observation: "Nota sintética");
            order.AddItem(new OrderItem(product.Id, 2, product.Price, "Observação sintética"));
            if (terminal) order.CancelPendingPayment();
            operational.Orders.Add(order); await operational.SaveChangesAsync(); return order;
        }
        public async ValueTask DisposeAsync() { await privacy.DisposeAsync(); await operational.Database.CloseConnectionAsync(); await operational.DisposeAsync(); }
    }
}
