using System.Net;
using System.Data.Common;
using System.Net.Http.Json;
using System.Text.Json;
using BurgerHouse.Api.Admin;
using BurgerHouse.Api.Images;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Api.Tests;

public sealed class AdminSecurityTests : IAsyncLifetime
{
    private readonly string isolatedRoot = Path.Combine(Path.GetTempPath(), $"burger-admin-test-{Guid.NewGuid():N}");
    private string database => Path.Combine(isolatedRoot, "admin.db");
    private WebApplicationFactory<Program> app = null!;
    private HttpClient client = null!;
    private readonly QueryCounter queries = new();
    private readonly string password = $"Test-only-{Guid.NewGuid()}";
    public async Task InitializeAsync()
    {
        Directory.CreateDirectory(isolatedRoot);
        var pgConnection = TestDatabase.PrepareOperational(database);
        app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("IntegrationTest");
            builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
            builder.UseSetting("Database:Provider", pgConnection == null ? "Sqlite" : "PostgreSQL");
            builder.UseSetting("ConnectionStrings:DefaultConnection", pgConnection ?? $"Data Source={database}");
            builder.UseSetting("Admin:DataProtectionPath", Path.Combine(isolatedRoot, "keys"));
            builder.UseSetting("AZURE_TRANSLATION_ENABLED", "false");
            builder.UseSetting("PagBank:Token", "test-placeholder");
            builder.UseSetting("PagBank:RedirectUrl", "https://example.invalid/");
            builder.UseSetting("PagBank:NotificationUrl", "https://example.invalid/webhook");
            builder.UseSetting("Admin:ForwardedHeaders:KnownProxies:0", "198.51.100.1");
            builder.UseSetting("Admin:ForwardedHeaders:KnownNetworks:0", "198.51.100.128/25");
            builder.ConfigureServices(services =>
            {
                if (pgConnection != null) services.ConfigureDbContext<PostgresContext>(options => options.AddInterceptors(queries));
                else services.ConfigureDbContext<BurgerHouseDbContext>(options => options.AddInterceptors(queries));
                services.AddSingleton(new ProductImageStorage(Path.Combine(isolatedRoot, "images")));
                services.ConfigureHttpClientDefaults(http => http.ConfigurePrimaryHttpMessageHandler(
                    () => new DenyOutboundHttpHandler()));
                // A restricted network supplied by the hosting layer, not an Internet-wide trust list.
                services.Configure<Microsoft.AspNetCore.Builder.ForwardedHeadersOptions>(options =>
                    options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(IPAddress.Parse("198.18.0.0"), 24)));
                services.Insert(0, ServiceDescriptor.Singleton<IStartupFilter, TestPeerFilter>());
                services.AddSingleton<TimeProvider>(new LoginClock());
            });
            builder.ConfigureLogging(logging => logging.ClearProviders());
        });
        client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        using var scope = app.Services.CreateScope();
        if (pgConnection != null)
        {
            var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
            db.Products.Add(new Product("burger-fixture", "Produto local", 20m));
            await db.SaveChangesAsync();
        }
        await scope.ServiceProvider.GetRequiredService<IAdminIdentity>().CreateFirstOwnerAsync("owner@example.invalid", password, default);
    }
    public async Task DisposeAsync()
    {
        client.Dispose(); await app.DisposeAsync();
        SqliteCleanup();
    }
    private void SqliteCleanup()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        foreach (var path in new[] { database, database + "-shm", database + "-wal" }) File.Delete(path);
        if (Path.GetDirectoryName(Path.GetFullPath(isolatedRoot)) != Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath())))
            throw new InvalidOperationException("Unexpected test directory.");
        Directory.Delete(isolatedRoot, recursive: true);
    }
    [Fact]
    public async Task StockMovementPersistsOnceAcrossScopes()
    {
        using var first = app.Services.CreateScope();
        var stock = first.ServiceProvider.GetRequiredService<IAdminStockService>();
        var item = await stock.CreateAsync(new("Ingrediente sintético", "kg", 1m), 1, default);
        var movement = new StockMove(Guid.NewGuid(), 2.50m, "Recebimento", item.Revision);
        await stock.MoveAsync(item.Id, movement, 1, default);
        using var next = app.Services.CreateScope();
        var reader = next.ServiceProvider.GetRequiredService<IAdminStockService>();
        await reader.MoveAsync(item.Id, movement, 1, default);
        Assert.Equal(2.50m, Assert.Single(await reader.ListAsync(default)).Quantity);
        Assert.Equal(movement.RequestId, Assert.Single(await reader.HistoryAsync(item.Id, 1, default)).Id);
    }

    [Fact]
    public async Task FixtureRejectsOutboundHttp()
    {
        using var outbound = app.Services.GetRequiredService<IHttpClientFactory>().CreateClient();
        await Assert.ThrowsAsync<InvalidOperationException>(() => outbound.GetAsync("https://example.invalid/probe"));
    }

    private sealed class DenyOutboundHttpHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Outbound HTTP is disabled in the administrative test fixture.");
    }
    private async Task Token(string endpoint)
    {
        var json = await client.GetFromJsonAsync<JsonElement>($"/api/admin/auth/{endpoint}");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", json.GetProperty("csrfToken").GetString());
    }
    private async Task<HttpResponseMessage> Login(string? email = null, string? secret = null)
    {
        await Token("login");
        return await client.PostAsJsonAsync("/api/admin/auth/login", new { email = email ?? "owner@example.invalid", password = secret ?? password });
    }
    [Fact]
    public async Task ValidLoginUsesSecureCookiesAndLogoutRevokesEvenReplayedCookie()
    {
        var login = await Login(); Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = Assert.Single(login.Headers.GetValues("Set-Cookie"), v => v.StartsWith("BurgerHouse.Owner="));
        Assert.Contains("httponly", cookie.ToLowerInvariant()); Assert.Contains("secure", cookie.ToLowerInvariant());
        Assert.Contains("samesite=strict", cookie.ToLowerInvariant()); Assert.Contains("path=/api/admin", cookie);
        var raw = await login.Content.ReadAsStringAsync();
        Assert.DoesNotContain(password, raw); Assert.DoesNotContain("Hash", raw);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/dashboard")).StatusCode);
        await Token("me");
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/admin/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/dashboard")).StatusCode);
        using var replay = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        replay.DefaultRequestHeaders.Add("Cookie", cookie.Split(';')[0]);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.GetAsync("/api/admin/dashboard")).StatusCode);
    }
    [Theory]
    [InlineData("owner@example.invalid")]
    [InlineData("missing@example.invalid")]
    public async Task InvalidCredentialsAreIndistinguishable(string email)
    {
        var response = await Login(email, "invalid-test-password");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("Credenciais inválidas.", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString());
    }
    [Theory]
    [InlineData("dashboard")]
    [InlineData("notifications")]
    [InlineData("orders")]
    [InlineData("orders/movement")]
    [InlineData("orders/1")]
    [InlineData("products")]
    [InlineData("store")]
    [InlineData("finance/summary")]
    [InlineData("finance/revenue")]
    [InlineData("finance/revenue-by-category")]
    [InlineData("finance/payment-methods")]
    [InlineData("finance/transactions")]
    [InlineData("auth/me")]
    public async Task EveryReadEndpointRejectsAnonymousAndDoesNotCache(string path)
    {
        var response = await client.GetAsync("/api/admin/" + path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
    }
    [Theory]
    [InlineData("orders/1/status", "PATCH")]
    [InlineData("products/1", "PATCH")]
    [InlineData("auth/logout", "POST")]
    public async Task WritesRejectAnonymous(string path, string method)
    {
        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), "/api/admin/" + path) { Content = JsonContent.Create(new { }) });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
    [Theory]
    [InlineData("dashboard")]
    [InlineData("notifications")]
    [InlineData("orders")]
    [InlineData("products")]
    [InlineData("store")]
    [InlineData("finance/summary")]
    [InlineData("finance/revenue")]
    [InlineData("finance/revenue-by-category")]
    [InlineData("finance/payment-methods")]
    [InlineData("finance/transactions")]
    public async Task OwnerCanAccessSafeDtos(string path)
    {
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        var response = await client.GetAsync("/api/admin/" + path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        if (path == "finance/summary")
        {
            using var json = JsonDocument.Parse(text);
            var summary = json.RootElement;
            Assert.Equal(summary.GetProperty("grossRevenue").GetDecimal() - summary.GetProperty("refundedAmount").GetDecimal(),
                summary.GetProperty("netRevenue").GetDecimal());
            Assert.True(summary.TryGetProperty("unknownApprovalPayments", out _));
        }
        foreach (var forbidden in new[] { password, "passwordHash", "idempotencyKey", "externalPaymentId", "externalCheckoutId", "test-placeholder" })
            Assert.DoesNotContain(forbidden, text);
    }
    [Theory]
    [InlineData("stock")]
    [InlineData("team")]
    [InlineData("agenda?start=2026-11-01&end=2026-11-30")]
    [InlineData("notifications/inbox")]
    public async Task OperationalModulesRequireOwner(string path)
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/" + path)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/" + path)).StatusCode);
    }

    [Fact]
    public async Task StockMovementIsAtomicIdempotentAndRejectsStaleAndInvalidBalances()
    {
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        var draft = new { name = "Farinha", unit = "kg", minimum = 1.325m };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/admin/stock", draft)).StatusCode);
        await Token("me");
        var stock = await (await client.PostAsJsonAsync("/api/admin/stock", draft)).Content.ReadFromJsonAsync<StockRow>();
        Assert.NotNull(stock);
        var path = $"/api/admin/stock/{stock.Id}/movements";
        var move = new StockMove(Guid.NewGuid(), 1.125m, "Entrada sintética", stock.Revision);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync(path, move)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync(path, move)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(path, move with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path, move with
            { RequestId = Guid.NewGuid(), Revision = stock.Revision + 1, Delta = -1.126m })).StatusCode);
        Assert.Equal(1.125m, Assert.Single((await client.GetFromJsonAsync<StockRow[]>("/api/admin/stock"))!).Quantity);
        Assert.Single((await client.GetFromJsonAsync<StockHistory[]>(path))!);
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
        Assert.Equal(2, await db.AdminAuditLogs.CountAsync(log => log.EntityType == "StockItem"));
    }

    [Fact]
    public async Task NotificationMutationIsScopedToOwnerAndCannotUndoArchive()
    {
        const string inbox = "/api/admin/notifications/inbox";
        var otherPassword = $"Test-only-{Guid.NewGuid()}";
        const string otherEmail = "second@example.invalid";
        int orderId;
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
            var other = new AdminUser(otherEmail, "fixture");
            other.ReplaceHash(new Microsoft.AspNetCore.Identity.PasswordHasher<AdminUser>().HashPassword(other, otherPassword));
            var order = new Order(0, "pickup", "Cliente Sintético", "11999990000", "fixture@example.invalid", "52998224725");
            order.AddItem(new OrderItem(1, 1, 20m));
            db.AddRange(other, order);
            await db.SaveChangesAsync();
            orderId = order.Id;
            var payment = new Payment(orderId, order.Total, Guid.NewGuid().ToString(), BurgerHouse.Domain.Enums.PaymentMethod.Pix);
            payment.Approve();
            db.Add(payment);
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        Assert.Equal(1, (await client.GetFromJsonAsync<NotificationInbox>(inbox))!.UnreadCount);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsync($"{inbox}/{orderId}/archive", null)).StatusCode);
        await Token("me");
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsync($"{inbox}/{orderId}/archive", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsync($"{inbox}/{orderId}/read", null)).StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<NotificationInbox>(inbox))!.Items);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/admin/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(otherEmail, otherPassword)).StatusCode);
        var otherInbox = (await client.GetFromJsonAsync<NotificationInbox>(inbox))!;
        Assert.Equal(1, otherInbox.UnreadCount);
        await Token("me");
        Assert.False(Assert.Single(otherInbox.Items).Read);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsync($"{inbox}/read", null)).StatusCode);
        Assert.Equal(0, (await client.GetFromJsonAsync<NotificationInbox>(inbox))!.UnreadCount);
    }

    [Fact]
    public async Task OwnerDashboardCountsAndRevenueUseTheSameRecordedScope()
    {
        var utcNow = app.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        var today = DateRange.LocalToday(utcNow);
        var approval = DateRange.FromDates(today, today).Start.AddHours(18);
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
            foreach (var channel in new[] { "delivery", "pickup" })
            {
                var delivery = channel == "delivery";
                var order = new Order(delivery ? 5 : 0, channel, "Cliente Sintético", "11999990000", "fixture@example.invalid",
                    "52998224725", delivery ? "38400-000" : null, delivery ? "Rua Sintética" : null,
                    delivery ? "10" : null, delivery ? "Centro" : null, delivery ? "Uberlândia" : null);
                order.AddItem(new OrderItem(1, 1, 20m, unitCost: delivery ? 8m : null, saleCategory: delivery ? "menu" : null));
                order.MarkAsReceived();
                db.Orders.Add(order);
                await db.SaveChangesAsync();
                var payment = new Payment(order.Id, order.Total, Guid.NewGuid().ToString(), BurgerHouse.Domain.Enums.PaymentMethod.Pix);
                payment.Approve(approval);
                db.Payments.Add(payment);
                await db.SaveChangesAsync();
            }
            var cancelled = new Order(0, "pickup", "Cliente cancelado", "11999990000", "fixture@example.invalid", "52998224725");
            cancelled.AddItem(new OrderItem(1, 1, 20m));
            cancelled.CancelPendingPayment();
            db.Add(cancelled);
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        var dashboard = (await client.GetFromJsonAsync<Dashboard>("/api/admin/dashboard"))!;
        var all = (await client.GetFromJsonAsync<Page<OrderRow>>("/api/admin/orders"))!;
        var activePickup = (await client.GetFromJsonAsync<Page<OperationalOrder>>("/api/admin/orders/operational?ActiveOnly=true&Channel=pickup"))!;
        Assert.Equal(all.Total, dashboard.OrderCounts!.Sum(row => row.Count));
        Assert.Equal("Received", Assert.Single(activePickup.Items).Order.Status);
        Assert.Equal(1, activePickup.Total);
        Assert.Equal(2, dashboard.OpenOrders);
        Assert.Equal(1, Assert.Single(dashboard.OrderCounts!, row => row.Status == "Cancelled").Count);
        var finance = (await client.GetFromJsonAsync<FinanceSummary>("/api/admin/finance/summary?period=today"))!;
        var pickup = (await client.GetFromJsonAsync<FinanceSummary>("/api/admin/finance/summary?period=today&channel=pickup"))!;
        var deliveryFinance = (await client.GetFromJsonAsync<FinanceSummary>("/api/admin/finance/summary?period=today&channel=delivery"))!;
        var hours = (await client.GetFromJsonAsync<RevenuePoint[]>("/api/admin/finance/revenue?period=today&granularity=hour"))!;
        Assert.Equal(finance, dashboard.Today);
        Assert.Equal(45m, finance.GrossRevenue);
        Assert.Equal(finance.GrossRevenue, pickup.GrossRevenue + deliveryFinance.GrossRevenue);
        Assert.Equal(22.5m, finance.AverageTicket);
        Assert.True(dashboard.Week.GrossRevenue >= finance.GrossRevenue);
        Assert.Equal(24, hours.Length);
        Assert.Equal(finance.GrossRevenue, hours.Sum(point => point.Revenue));
        Assert.EndsWith("T18:00", Assert.Single(hours, point => point.Revenue > 0).Date);
        Assert.Null(pickup.GrossProfit);
        Assert.Equal(12m, deliveryFinance.GrossProfit);
        var byCategory = (await client.GetFromJsonAsync<CategoryRevenueReport>("/api/admin/finance/revenue-by-category?period=today&channel=delivery"))!;
        Assert.Equal(deliveryFinance.GrossRevenue, byCategory.GrossRevenue);
        Assert.Equal(5m, byCategory.DeliveryFees);
        Assert.Equal(new CategoryRevenueRow("menu", 20m), Assert.Single(byCategory.Categories));
        var pickupCategory = (await client.GetFromJsonAsync<CategoryRevenueReport>("/api/admin/finance/revenue-by-category?period=7d&channel=pickup"))!;
        Assert.Empty(pickupCategory.Categories);
        Assert.Equal(20m, pickupCategory.UnclassifiedRevenue);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/finance/revenue-by-category?channel=hall")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/orders?Channel=hall")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/finance/summary?channel=hall")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/finance/summary?period=shift")).StatusCode);
        await Token("me");
        var settings = (await client.GetFromJsonAsync<OperationSettings>("/api/admin/operation/settings"))!;
        var changed = settings with { Limits = settings.Limits with {
            Schedule = new(true, "00:00", "23:59"), PendingPaymentAgeHours = 2
        } };
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync("/api/admin/operation/settings", changed)).StatusCode);
        var shiftDashboard = (await client.GetFromJsonAsync<Dashboard>("/api/admin/dashboard"))!;
        var shiftSummary = (await client.GetFromJsonAsync<FinanceSummary>("/api/admin/finance/summary?period=shift"))!;
        Assert.Equal(shiftDashboard.Shift!.Summary, shiftSummary);
        Assert.Equal(45m, shiftSummary.GrossRevenue);
        Assert.True(shiftDashboard.Week.GrossRevenue >= shiftSummary.GrossRevenue);
        var shiftHours = (await client.GetFromJsonAsync<RevenuePoint[]>("/api/admin/finance/revenue?period=shift&granularity=hour"))!;
        Assert.Equal(shiftSummary.GrossRevenue, shiftHours.Sum(point => point.Revenue));
        var shiftCategories = (await client.GetFromJsonAsync<CategoryRevenueReport>("/api/admin/finance/revenue-by-category?period=shift"))!;
        Assert.Equal(shiftSummary.GrossRevenue, shiftCategories.GrossRevenue);

        var overnight = DateRange.ForShift(new DateTime(2026, 11, 18, 4, 0, 0, DateTimeKind.Utc), new(true, "18:00", "02:00"))!;
        Assert.Equal(new DateTime(2026, 11, 17, 21, 0, 0, DateTimeKind.Utc), overnight.Start);
        Assert.Equal(new DateTime(2026, 11, 18, 5, 0, 0, DateTimeKind.Utc), overnight.End);
    }

    [Fact]
    public async Task OrderMovementUsesSaoPauloCalendarAndIncludesUnpaidButNotCancelledOrders()
    {
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
            foreach (var (utc, channel, cancelled) in new[]
            {
                (new DateTime(2025, 7, 1, 2, 59, 0, DateTimeKind.Utc), "pickup", false),
                (new DateTime(2025, 7, 1, 3, 0, 0, DateTimeKind.Utc), "pickup", false),
                (new DateTime(2025, 7, 1, 3, 35, 0, DateTimeKind.Utc), "pickup", false),
                (new DateTime(2025, 7, 1, 3, 45, 0, DateTimeKind.Utc), "pickup", true),
                (new DateTime(2025, 8, 1, 2, 59, 0, DateTimeKind.Utc), "delivery", false),
                (new DateTime(2025, 8, 1, 3, 0, 0, DateTimeKind.Utc), "pickup", false),
            })
            {
                var delivery = channel == "delivery";
                var order = new Order(delivery ? 5 : 0, channel, "Cliente de teste", "11999990000", "fixture@example.invalid",
                    "52998224725", delivery ? "38400-000" : null, delivery ? "Rua Sintética" : null,
                    delivery ? "10" : null, delivery ? "Centro" : null, delivery ? "Uberlândia" : null);
                order.AddItem(new OrderItem(1, 1, 20m));
                if (cancelled) order.CancelPendingPayment();
                db.Add(order);
                db.Entry(order).Property(o => o.CreatedAt).CurrentValue = utc;
            }
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        const string url = "/api/admin/orders/movement";
        var july = (await client.GetFromJsonAsync<OrderMovementReport>(url + "?month=2025-07"))!;
        Assert.Equal(new DateOnly(2025, 7, 1), july.Start);
        Assert.Equal(new DateOnly(2025, 7, 31), july.End);
        Assert.Equal(new[] { new OrderMovementHour(july.Start, 0, 2), new OrderMovementHour(july.End, 23, 1) }, july.Hours);
        var pickup = (await client.GetFromJsonAsync<OrderMovementReport>(url + "?month=2025-07&channel=pickup"))!;
        Assert.Equal(july.Hours[0], Assert.Single(pickup.Hours));
        var weekly = (await client.GetFromJsonAsync<OrderMovementReport>(url))!;
        Assert.Equal(weekly.Today, weekly.End);
        Assert.Equal(weekly.End.AddDays(-27), weekly.Start);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(url + "?channel=hall")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(url + "?month=2025-13")).StatusCode);
    }

    [Fact]
    public async Task OperationalOrdersPreserveContractsWithBoundedQueries()
    {
        const string list = "/api/admin/orders";
        const string operational = list + "/operational";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(operational)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
            var orders = Enumerable.Range(0, 21).Select(index =>
            {
                var order = index % 2 == 0
                    ? new Order(5, "delivery", "Cliente Lote", "11999990000", "fixture@example.invalid",
                        "52998224725", "38400-000", "Rua Teste", "10", "Centro", "Uberlândia")
                    : new Order(0, "pickup", "Cliente Lote", "11999990000", "fixture@example.invalid", "52998224725");
                order.AddItem(new OrderItem(1, 2, 12.50m, "Sem molho"));
                if (index == 0) order.MarkAsReceived();
                return order;
            }).ToArray();
            db.Orders.AddRange(orders);
            await db.SaveChangesAsync();
        }

        async Task<Page<OperationalOrder>> Load(string filter, int size, int expectedQueries)
        {
            queries.Reset();
            var page = (await client.GetFromJsonAsync<Page<OperationalOrder>>(operational + filter))!;
            Assert.Equal(expectedQueries, queries.Count);
            Assert.Equal(size, page.Items.Count);
            return page;
        }

        var page = await Load("?Sort=oldest&Search=Lote", 20, 5);
        queries.Reset();
        var legacy = (await client.GetFromJsonAsync<Page<OrderRow>>(list + "?Sort=oldest&Search=Lote"))!;
        Assert.Equal(legacy.Items, page.Items.Select(item => item.Order).ToArray());
        Assert.Equal(legacy.Total, page.Total);
        Assert.Equal(legacy.PageSize, page.PageSize);
        foreach (var item in page.Items)
        {
            var detail = (await client.GetFromJsonAsync<OrderDetail>($"{list}/{item.Order.Id}"))!;
            Assert.Equal(new OperationalOrder(detail.Order, detail.CustomerPhone, detail.Street, detail.HouseNumber,
                detail.Neighborhood, detail.City, detail.DeliveryFee, item.Items), item);
            Assert.Equal(detail.Items, item.Items);
        }
        Assert.Equal(103, queries.Count);

        var next = await Load("?Sort=oldest&Page=2", 1, 5);
        Assert.Equal(21, next.Total);
        Assert.Equal(2, next.PageNumber);
        var newest = await Load("?Sort=newest", 20, 5);
        Assert.Equal(next.Items[0].Order.Id, newest.Items[0].Order.Id);
        Assert.Equal(1, (await Load("?Status=Received", 1, 5)).Total);
        Assert.Equal(0, (await Load("?Search=Inexistente", 0, 3)).Total);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(operational + "?Sort=wrong")).StatusCode);
    }

    private sealed class QueryCounter : DbCommandInterceptor
    {
        private int count;
        public int Count => Volatile.Read(ref count);
        public void Reset() => Interlocked.Exchange(ref count, 0);

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            // Session validation also reads SQLite. Count only order payload queries.
            if (!command.CommandText.Contains("AdminSession", StringComparison.Ordinal))
                Interlocked.Increment(ref count);
            return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
        }
    }

    [Fact]
    public async Task OwnerOrderLifecyclePersistsThroughHttpWithCsrfConcurrencyAndChecklist()
    {
        int id;
        int paymentId;
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
            var order = new Order(5, "delivery", "Cliente Sintético", "11999990000",
                "fixture@example.invalid", "52998224725", "38400-000", "Rua Teste", "10", "Centro", "Uberlândia");
            order.AddItem(new OrderItem(1, 1, 43.90m));
            db.Orders.Add(order);
            await db.SaveChangesAsync();
            var payment = new Payment(order.Id, order.Total, Guid.NewGuid().ToString(), BurgerHouse.Domain.Enums.PaymentMethod.Pix);
            payment.Approve();
            order.MarkAsReceived();
            db.Payments.Add(payment);
            await db.SaveChangesAsync();
            id = order.Id;
            paymentId = payment.Id;
        }

        var url = $"/api/admin/orders/{id}";
        async Task<HttpStatusCode> Advance(string expectedStatus, string status, DispatchChecklist? checklist = null)
        {
            using var response = await client.PatchAsJsonAsync(url + "/status", new { expectedStatus, status, checklist });
            return response.StatusCode;
        }
        async Task AssertSaved(string status)
        {
            var detail = await client.GetFromJsonAsync<JsonElement>(url);
            var row = detail.GetProperty("order");
            Assert.Equal(status, row.GetProperty("status").GetString());
            Assert.Equal("Approved", row.GetProperty("paymentStatus").GetString());
        }

        Assert.Equal(HttpStatusCode.Unauthorized, await Advance("Received", "Preparing"));
        using var login = await Login();
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, await Advance("Received", "Preparing"));
        await AssertSaved("Received");
        await Token("me");
        Assert.Equal(HttpStatusCode.Conflict, await Advance("Received", "Completed"));
        Assert.Equal(HttpStatusCode.NoContent, await Advance("Received", "Preparing"));
        Assert.Equal(HttpStatusCode.Conflict, await Advance("Received", "Preparing"));
        await AssertSaved("Preparing");
        Assert.Equal(HttpStatusCode.NoContent, await Advance("Preparing", "ReadyForPickup"));
        Assert.Equal(HttpStatusCode.BadRequest, await Advance("ReadyForPickup", "OutForDelivery", new(true, false, true)));
        await AssertSaved("ReadyForPickup");
        Assert.Equal(HttpStatusCode.NoContent, await Advance("ReadyForPickup", "OutForDelivery", new(true, true, true)));
        await AssertSaved("OutForDelivery");
        Assert.Equal(HttpStatusCode.NoContent, await Advance("OutForDelivery", "Completed"));
        await AssertSaved("Completed");

        using var verification = app.Services.CreateScope();
        var saved = verification.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
        var persisted = await saved.Payments.AsNoTracking().SingleAsync(payment => payment.Id == paymentId);
        Assert.Equal(BurgerHouse.Domain.Enums.PaymentStatus.Approved, persisted.Status);
        Assert.Equal(48.90m, persisted.Amount);
        var audit = await saved.AdminAuditLogs.AsNoTracking().Where(log => log.EntityId == id.ToString()).ToListAsync();
        var dispatch = Assert.Single(audit, log => log.Changes.Contains("\"Packaging\":true"));
        Assert.Contains("\"Identification\":true", dispatch.Changes);
    }

    [Fact]
    public async Task PopulatedAdminResponsesExcludePaymentIdentityAndLimitFulfillmentToDetails()
    {
        var orderIds = new List<int>();
        var keys = new List<string>();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
            foreach (var type in new[] { "delivery", "pickup" })
            {
                var order = new Order(0, type, "Cliente Privacidade", "11999990000", "privado@teste.com", "52998224725",
                    type == "delivery" ? "38400-000" : null, type == "delivery" ? "Rua Privada" : null,
                    type == "delivery" ? "10" : null, type == "delivery" ? "Centro" : null,
                    type == "delivery" ? "Uberlândia" : null);
                order.AddItem(new OrderItem(1, 1, 43.90m));
                db.Orders.Add(order);
                await db.SaveChangesAsync();
                var key = Guid.NewGuid().ToString();
                keys.Add(key);
                var payment = new Payment(order.Id, order.Total, key, BurgerHouse.Domain.Enums.PaymentMethod.Pix);
                payment.SetExternalCheckoutId($"CHEC_privacy_{order.Id}");
                payment.SetExternalPaymentId($"CHAR_privacy_{order.Id}");
                payment.Approve(); order.MarkAsReceived();
                db.Payments.Add(payment);
                await db.SaveChangesAsync();
                orderIds.Add(order.Id);
                // Historical pickup rows must not expose an accidentally retained address.
                if (type == "pickup")
                    await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE \"Orders\" SET \"Street\" = 'Rua Legada Privada' WHERE \"Id\" = {order.Id}");
            }
        }
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        foreach (var path in new[] { "dashboard", "notifications", "orders", "products", "store",
            "finance/summary", "finance/revenue", "finance/payment-methods", "finance/transactions" }
            .Concat(orderIds.Select(id => $"orders/{id}")))
        {
            var response = await client.GetAsync("/api/admin/" + path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var text = await response.Content.ReadAsStringAsync();
            foreach (var forbidden in new[] { "enc:v1:", "52998224725", "privado@teste.com", "customerTaxId", "customerEmail",
                "externalPaymentId", "externalCheckoutId", "idempotencyKey", "CHAR_privacy_", "CHEC_privacy_",
                "test-placeholder", "Authorization", "Bearer", "qr_code", "tax_id", "cardNumber", "cvv" }.Concat(keys))
                Assert.DoesNotContain(forbidden, text, StringComparison.OrdinalIgnoreCase);
            if (!path.StartsWith("orders/"))
                foreach (var field in new[] { "customerPhone", "zipCode", "street", "houseNumber", "neighborhood", "\"complement\":", "11999990000", "Rua Privada" })
                    Assert.DoesNotContain(field, text, StringComparison.OrdinalIgnoreCase);
            else
            {
                var json = JsonSerializer.Deserialize<JsonElement>(text);
                Assert.Equal("11999990000", json.GetProperty("customerPhone").GetString());
                Assert.Equal(path == $"orders/{orderIds[0]}" ? "Rua Privada" : null, json.GetProperty("street").GetString());
            }
        }
    }

    [Fact]
    public async Task ExpiredSessionCannotAccess()
    {
        await Login();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
        await db.Set<AdminSession>().ExecuteUpdateAsync(s => s.SetProperty(p => p.ExpiresAt, DateTime.UtcNow.AddMinutes(-1)));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
    }
    [Fact]
    public async Task ProductImageUploadRequiresOwnerAndCsrf()
    {
        using var bitmap = new SkiaSharp.SKBitmap(16, 16);
        bitmap.Erase(SkiaSharp.SKColors.Orange);

        using var image = SkiaSharp.SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(
            SkiaSharp.SKEncodedImageFormat.Png, 90);

        var bytes = encoded.ToArray();

        static MultipartFormDataContent UploadBody(byte[] content)
        {
            var form = new MultipartFormDataContent();
            var part = new ByteArrayContent(content);

            part.Headers.ContentType =
                new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");

            form.Add(part, "file", "photo.png");

            return form;
        }

        const string endpoint = "/api/admin/products/1/image";

        using (var body = UploadBody(bytes))
        {
            using var response = await client.PostAsync(endpoint, body);

            Assert.Equal(
                HttpStatusCode.Unauthorized,
                response.StatusCode);
        }

        Assert.Equal(
            HttpStatusCode.OK,
            (await Login()).StatusCode);

        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");

        using (var body = UploadBody(bytes))
        {
            using var response = await client.PostAsync(endpoint, body);

            Assert.Equal(
                HttpStatusCode.BadRequest,
                response.StatusCode);
        }

        await Token("me");

        string? imageUrl = null;

        try
        {
            using (var body = UploadBody(bytes))
            {
                using var response = await client.PostAsync(endpoint, body);

                Assert.Equal(
                    HttpStatusCode.OK,
                    response.StatusCode);

                var json =
                    await response.Content.ReadFromJsonAsync<JsonElement>();

                imageUrl = json.GetProperty("imageUrl").GetString();
            }

            Assert.NotNull(imageUrl);

            Assert.Matches(
                @"\A/api/product-images/[a-f0-9]{32}\.webp\z",
                imageUrl);

            using (var response = await client.GetAsync(imageUrl))
            {
                Assert.Equal(
                    HttpStatusCode.OK,
                    response.StatusCode);

                Assert.Equal(
                    "image/webp",
                    response.Content.Headers.ContentType?.MediaType);
            }

            client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");

            using (var response = await client.DeleteAsync(endpoint))
            {
                Assert.Equal(
                    HttpStatusCode.BadRequest,
                    response.StatusCode);
            }

            await Token("me");

            using (var response = await client.DeleteAsync(endpoint))
            {
                Assert.Equal(
                    HttpStatusCode.NoContent,
                    response.StatusCode);
            }

            using var missing = await client.GetAsync(imageUrl);

            Assert.Equal(
                HttpStatusCode.NotFound,
                missing.StatusCode);
        }
        finally
        {
            if (imageUrl is not null)
            {
                try
                {
                    await Token("me");

                    using var cleanup =
                        await client.DeleteAsync(endpoint);
                }
                catch
                {
                    // Preserve the original test failure.
                }
            }
        }
    }

    [Fact]
    public async Task CsrfProtectsLoginAndAuthenticatedMutations()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/admin/auth/login",
            new { email = "owner@example.invalid", password })).StatusCode);
        await Login();
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync("/api/admin/products/1", new { price = 30, costPrice = 10, isActive = true })).StatusCode);
        await Token("me");
        Assert.Equal(HttpStatusCode.NoContent, (await client.PatchAsJsonAsync("/api/admin/products/1", new { price = 30, costPrice = 10, isActive = true, name = "Produto atualizado", description = "Descricao atualizada para teste" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync("/api/admin/products/1", new { costPrice = 5 })).StatusCode);
        var products = await client.GetFromJsonAsync<JsonElement>("/api/admin/products");
        Assert.Equal("Produto atualizado", products.EnumerateArray().Single(p => p.GetProperty("id").GetInt32() == 1).GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/finance/summary?period=custom&start=invalid")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/admin/orders/999")).StatusCode);
    }
    [Fact]
    public async Task LoginRateLimitDoesNotTrustForwardedHeaders()
    {
        await Token("login");
        for (var i = 0; i < 10; i++)
        {
            client.DefaultRequestHeaders.Remove("X-Forwarded-For"); client.DefaultRequestHeaders.Add("X-Forwarded-For", $"192.0.2.{i}");
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/admin/auth/login",
                new { email = "missing@example.invalid", password = "incorrect-test-only" })).StatusCode);
        }
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/admin/auth/login",
            new { email = "missing@example.invalid", password = "incorrect-test-only" })).StatusCode);
    }

    [Theory]
    [InlineData("invalid", 0)]
    [InlineData("menu", -1)]
    [InlineData("drinks", 1000000)]
    public async Task ProductClassificationRejectsInvalidRequests(string category, int displayOrder)
    {
        await Login();
        await Token("me");
        var response = await client.PostAsJsonAsync("/api/admin/products", new {
            name = "Teste", description = "Descrição", price = 12, isActive = true, category, displayOrder
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ProductClassificationFlowsFromAdminToPublicCatalog()
    {
        await Login();
        await Token("me");
        var created = await client.PostAsJsonAsync("/api/admin/products", new {
            name = "Suco classificação", description = "Descrição", englishName = "Juice", englishDescription = "Fresh juice",
            price = 12, isActive = true, category = "drinks", displayOrder = 0
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        var edited = await client.PatchAsJsonAsync($"/api/admin/products/{id}", new {
            name = "Suco classificação", description = "Descrição", englishName = "Juice", englishDescription = "Fresh juice",
            price = 12, isActive = false, category = "sides", displayOrder = 2
        });
        Assert.Equal(HttpStatusCode.NoContent, edited.StatusCode);
        var catalog = await client.GetFromJsonAsync<JsonElement>("/api/products");
        var product = catalog.EnumerateArray().Single(p => p.GetProperty("name").GetString() == "Suco classificação");
        Assert.Equal("sides", product.GetProperty("category").GetString());
        Assert.Equal(2, product.GetProperty("displayOrder").GetInt32());
        Assert.Equal("Juice", product.GetProperty("englishName").GetString());
        Assert.False(product.GetProperty("isActive").GetBoolean());
    }
    [Fact]
    public async Task ExhaustingOnePeerDoesNotBlockAnotherPeer()
    {
        for (var i = 0; i < 10; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Login(secret: "wrong")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login()).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Peer", "203.0.113.20");
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
    }
    [Theory]
    [InlineData("198.51.100.1")]
    [InlineData("198.51.100.130")]
    public async Task TrustedForwardingPartitionsByRightmostClientAndPreservesSeparateQuota(string proxy)
    {
        client.DefaultRequestHeaders.Add("X-Test-Peer", proxy);
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "192.0.2.99, 203.0.113.10");
        for (var i = 0; i < 10; i++)
        {
            var response = await Login(secret: "wrong");
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("203.0.113.10", Assert.Single(response.Headers.GetValues("X-Test-Observed-Peer")));
        }
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login()).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Forwarded-For");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.20");
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
    }
    [Fact]
    public async Task HostTrustedTlsOffloadSupportsCsrfLoginAndSeparateClientBuckets()
    {
        client.DefaultRequestHeaders.Add("X-Test-Peer", "198.18.0.5");
        client.DefaultRequestHeaders.Add("X-Test-Transport", "http");
        client.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "192.0.2.99, 203.0.113.10");
        var tokenResponse = await client.GetAsync("/api/admin/auth/login");
        Assert.Equal(HttpStatusCode.OK, tokenResponse.StatusCode);
        Assert.False(string.IsNullOrEmpty((await tokenResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("csrfToken").GetString()));
        Assert.Equal("https", Assert.Single(tokenResponse.Headers.GetValues("X-Test-Observed-Scheme")));
        Assert.Equal("203.0.113.10", Assert.Single(tokenResponse.Headers.GetValues("X-Test-Observed-Peer")));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
        for (var i = 0; i < 10; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Login(secret: "wrong")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login()).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Forwarded-For");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.20");
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("10.12.3.4", false)]
    [InlineData("172.20.3.4", false)]
    [InlineData("192.168.3.4", false)]
    [InlineData("169.254.130.1", false)]
    [InlineData("::ffff:10.12.3.4", true)]
    [InlineData("::ffff:172.20.3.4", true)]
    [InlineData("::ffff:192.168.3.4", true)]
    [InlineData("::ffff:169.254.130.1", true)]
    public async Task AppServiceHttpTransportRecognizesHttpsWithoutTrustingInternetPeers(string proxy, bool automatic)
    {
        await using var azureApp = app.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("WEBSITE_INSTANCE_ID", "test-instance");
            builder.UseSetting("WEBSITE_SITE_NAME", "test-site");
            builder.UseSetting("Admin:ForwardedHeaders:UseAzureAppServiceNetworks", "true");
            builder.UseSetting("ForwardedHeaders_Enabled", automatic ? "true" : "false");
        });
        client.Dispose();
        client = azureApp.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-Test-Peer", proxy);
        client.DefaultRequestHeaders.Add("X-Test-Transport", "http");
        client.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "192.0.2.99, 203.0.113.10");
        var response = await client.GetAsync("/api/admin/auth/login");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(string.IsNullOrEmpty((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("csrfToken").GetString()));
        Assert.Equal("True", Assert.Single(response.Headers.GetValues("X-Test-Observed-IsHttps")));
        Assert.Equal("203.0.113.10", Assert.Single(response.Headers.GetValues("X-Test-Observed-Peer")));
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), cookie => cookie.Contains("secure", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
        for (var i = 0; i < 10; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Login(secret: "wrong")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login()).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Forwarded-For");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.20");
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);

        // A second pass would consume the attacker-controlled leftmost hop because 10/8 is trusted.
        client.DefaultRequestHeaders.Remove("X-Forwarded-For");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.99, 10.20.30.40");
        response = await client.GetAsync("/api/admin/auth/login");
        Assert.Equal("10.20.30.40", Assert.Single(response.Headers.GetValues("X-Test-Observed-Peer")));

        client.DefaultRequestHeaders.Remove("X-Test-Peer");
        client.DefaultRequestHeaders.Add("X-Test-Peer", "203.0.113.50");
        response = await client.GetAsync("/api/admin/auth/login");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("False", Assert.Single(response.Headers.GetValues("X-Test-Observed-IsHttps")));
        Assert.Equal("203.0.113.50", Assert.Single(response.Headers.GetValues("X-Test-Observed-Peer")));
    }

    [Fact]
    public async Task AutomaticHostForwardingAndAdminBranchDoNotConsumeTwoHops()
    {
        await using var automaticApp = app.WithWebHostBuilder(builder =>
            builder.UseSetting("ForwardedHeaders_Enabled", "true"));
        using var automaticClient = automaticApp.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        automaticClient.DefaultRequestHeaders.Add("X-Test-Peer", "198.18.0.5");
        automaticClient.DefaultRequestHeaders.Add("X-Test-Transport", "http");
        automaticClient.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https, https");
        // The next address is also trusted, so a second middleware would incorrectly consume another hop.
        automaticClient.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.99, 198.18.0.20");
        var response = await automaticClient.GetAsync("/api/admin/auth/login");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("198.18.0.20", Assert.Single(response.Headers.GetValues("X-Test-Observed-Peer")));
        Assert.Equal("https", Assert.Single(response.Headers.GetValues("X-Test-Observed-Scheme")));
        // Prove the host middleware is active outside the Admin branch as well.
        var publicResponse = await automaticClient.GetAsync("/");
        Assert.Equal("198.18.0.20", Assert.Single(publicResponse.Headers.GetValues("X-Test-Observed-Peer")));
        automaticClient.DefaultRequestHeaders.Remove("X-Test-Peer");
        automaticClient.DefaultRequestHeaders.Add("X-Test-Peer", "203.0.113.10");
        var untrusted = await automaticClient.GetAsync("/api/admin/auth/login");
        Assert.Equal(HttpStatusCode.Conflict, untrusted.StatusCode);
        Assert.Equal("203.0.113.10", Assert.Single(untrusted.Headers.GetValues("X-Test-Observed-Peer")));
        Assert.Equal("http", Assert.Single(untrusted.Headers.GetValues("X-Test-Observed-Scheme")));
    }

    [Fact]
    public async Task UntrustedTlsOffloadCannotSpoofSchemeOrClientAddress()
    {
        client.DefaultRequestHeaders.Add("X-Test-Transport", "http");
        client.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "192.0.2.99");
        var response = await client.GetAsync("/api/admin/auth/login");
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("http", Assert.Single(response.Headers.GetValues("X-Test-Observed-Scheme")));
        Assert.Equal("203.0.113.10", Assert.Single(response.Headers.GetValues("X-Test-Observed-Peer")));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Ipv4AndMappedIpv6UseSameQuota()
    {
        for (var i = 0; i < 10; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Login(secret: "wrong")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Peer", "::ffff:203.0.113.10");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login()).StatusCode);
    }
    [Fact]
    public async Task ExplicitAdminForwardingDoesNotChangePublicRequests()
    {
        client.DefaultRequestHeaders.Add("X-Test-Peer", "198.51.100.1");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.20");
        var response = await client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("198.51.100.1", Assert.Single(response.Headers.GetValues("X-Test-Observed-Peer")));
    }
    [Theory]
    [InlineData("owner@example.invalid")]
    [InlineData("missing@example.invalid")]
    public async Task ProgressiveDenialsHaveSameBodyForUnknownAccountWrongPasswordAndCooldown(string email)
    {
        for (var i = 0; i < 6; i++)
        {
            var response = await Login(email, "wrong");
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("{\"error\":\"Credenciais inválidas.\"}", await response.Content.ReadAsStringAsync());
            Assert.False(response.Headers.Contains("Retry-After"));
            Assert.False(response.Headers.Contains("Set-Cookie"));
        }
    }
    [Fact]
    public async Task NormalizedPairCooldownRejectsEvenCorrectPasswordUntilElapsedAndSuccessResetsIt()
    {
        for (var i = 0; i < 5; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await Login(secret: "wrong")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(" OWNER@EXAMPLE.INVALID ")).StatusCode);
        ((LoginClock)app.Services.GetRequiredService<TimeProvider>()).Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(secret: "wrong")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
    }
    [Fact]
    public async Task ChangePasswordRequiresCurrentPasswordAndKeepsSessionWhenRejected()
    {
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        await Token("me");

        var response = await client.PostAsJsonAsync("/api/admin/auth/change-password", new
        {
            currentPassword = "wrong-current-password",
            newPassword = "New-test-password-123!"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/auth/me")).StatusCode);

        using var fresh = app.CreateClient(new()
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        var token = await fresh.GetFromJsonAsync<JsonElement>("/api/admin/auth/login");
        fresh.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token.GetProperty("csrfToken").GetString());

        Assert.Equal(HttpStatusCode.OK, (await fresh.PostAsJsonAsync("/api/admin/auth/login", new
        {
            email = "owner@example.invalid",
            password
        })).StatusCode);
    }

    [Fact]
    public async Task ChangePasswordRevokesExistingSessionsAndReplacesCredential()
    {
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        await Token("me");

        const string newPassword = "New-test-password-123!";

        var response = await client.PostAsJsonAsync("/api/admin/auth/change-password", new
        {
            currentPassword = password,
            newPassword
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/auth/me")).StatusCode);

        using var oldPasswordClient = app.CreateClient(new()
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        var oldToken = await oldPasswordClient.GetFromJsonAsync<JsonElement>("/api/admin/auth/login");
        oldPasswordClient.DefaultRequestHeaders.Add(
            "X-CSRF-TOKEN",
            oldToken.GetProperty("csrfToken").GetString());

        Assert.Equal(HttpStatusCode.Unauthorized, (await oldPasswordClient.PostAsJsonAsync(
            "/api/admin/auth/login",
            new
            {
                email = "owner@example.invalid",
                password
            })).StatusCode);

        using var newPasswordClient = app.CreateClient(new()
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        var newToken = await newPasswordClient.GetFromJsonAsync<JsonElement>("/api/admin/auth/login");
        newPasswordClient.DefaultRequestHeaders.Add(
            "X-CSRF-TOKEN",
            newToken.GetProperty("csrfToken").GetString());

        Assert.Equal(HttpStatusCode.OK, (await newPasswordClient.PostAsJsonAsync(
            "/api/admin/auth/login",
            new
            {
                email = "owner@example.invalid",
                password = newPassword
            })).StatusCode);
    }

    [Fact]
    public async Task ChangePasswordRejectsShortNewPassword()
    {
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        await Token("me");

        var response = await client.PostAsJsonAsync("/api/admin/auth/change-password", new
        {
            currentPassword = password,
            newPassword = "short"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
    }

    [Fact]
    public async Task ResetOwnerCredentialsPreservesAccountAndRevokesAllSessions()
    {
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        const string nextPassword = "New-test-only-password-123!";
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
        var identity = scope.ServiceProvider.GetRequiredService<IAdminIdentity>();
        var owner = await db.Set<AdminUser>().AsNoTracking().SingleAsync();
        var products = await db.Products.CountAsync();
        var extraSession = await identity.CreateSessionAsync(owner.Id, DateTime.UtcNow.AddHours(1), default);

        await identity.ResetOwnerPasswordAsync(nextPassword, default, " New.Owner@Example.Invalid ");

        var saved = await db.Set<AdminUser>().AsNoTracking().SingleAsync();
        Assert.Equal(owner.Id, saved.Id);
        Assert.Equal("NEW.OWNER@EXAMPLE.INVALID", saved.Email);
        Assert.NotEqual(owner.PasswordHash, saved.PasswordHash);
        Assert.NotEqual(nextPassword, saved.PasswordHash);
        Assert.Equal(products, await db.Products.CountAsync());
        Assert.False(await db.Set<AdminSession>().AnyAsync());
        Assert.False(await identity.IsSessionValidAsync(owner.Id, extraSession, DateTime.UtcNow, default));
        Assert.Null(await identity.AuthenticateAsync(owner.Email, password, default));
        Assert.Null(await identity.AuthenticateAsync(saved.Email, password, default));
        Assert.Equal(owner.Id, (await identity.AuthenticateAsync(saved.Email, nextPassword, default))!.Id);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
        var token = await client.GetFromJsonAsync<JsonElement>("/api/admin/auth/login");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token.GetProperty("csrfToken").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/admin/auth/login",
            new { email = saved.Email, password = nextPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("invalid-email", "New-test-only-password-123!")]
    [InlineData("valid@example.invalid", "short")]
    public async Task ResetOwnerCredentialsRejectsInvalidInputWithoutChanges(string email, string nextPassword)
    {
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
        var identity = scope.ServiceProvider.GetRequiredService<IAdminIdentity>();
        var before = await db.Set<AdminUser>().AsNoTracking().SingleAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => identity.ResetOwnerPasswordAsync(nextPassword, default, email));
        var after = await db.Set<AdminUser>().AsNoTracking().SingleAsync();
        Assert.Equal(before.Email, after.Email);
        Assert.Equal(before.PasswordHash, after.PasswordHash);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/auth/me")).StatusCode);
    }

    [Fact]
    public async Task ResetOwnerPasswordRevokesSessionsAndReplacesCredential()
    {
        Assert.Equal(HttpStatusCode.OK, (await Login()).StatusCode);

        const string newPassword = "Recovered-test-password-123!";

        using (var scope = app.Services.CreateScope())
        {
            var identity = scope.ServiceProvider.GetRequiredService<IAdminIdentity>();
            await identity.ResetOwnerPasswordAsync(newPassword, default);
        }

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/admin/auth/me")).StatusCode);

        using var oldPasswordClient = app.CreateClient(new()
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        var oldToken = await oldPasswordClient.GetFromJsonAsync<JsonElement>("/api/admin/auth/login");
        oldPasswordClient.DefaultRequestHeaders.Add(
            "X-CSRF-TOKEN",
            oldToken.GetProperty("csrfToken").GetString());

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await oldPasswordClient.PostAsJsonAsync("/api/admin/auth/login", new
            {
                email = "owner@example.invalid",
                password
            })).StatusCode);

        using var newPasswordClient = app.CreateClient(new()
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        var newToken = await newPasswordClient.GetFromJsonAsync<JsonElement>("/api/admin/auth/login");
        newPasswordClient.DefaultRequestHeaders.Add(
            "X-CSRF-TOKEN",
            newToken.GetProperty("csrfToken").GetString());

        Assert.Equal(HttpStatusCode.OK,
            (await newPasswordClient.PostAsJsonAsync("/api/admin/auth/login", new
            {
                email = "owner@example.invalid",
                password = newPassword
            })).StatusCode);
    }

    [Fact]
    public async Task ResetOwnerPasswordRejectsShortPasswordWithoutChangingCredential()
    {
        using var scope = app.Services.CreateScope();
        var identity = scope.ServiceProvider.GetRequiredService<IAdminIdentity>();

        await Assert.ThrowsAsync<ArgumentException>(() =>
            identity.ResetOwnerPasswordAsync("short", default));

        Assert.NotNull(await identity.AuthenticateAsync(
            "owner@example.invalid",
            password,
            default));
    }

    [Fact]
    public async Task ResetOwnerPasswordFailsWhenOwnerDoesNotExist()
    {
        using var scope = app.Services.CreateScope();
        var identity = scope.ServiceProvider.GetRequiredService<IAdminIdentity>();
        var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();

        await db.Set<AdminSession>().ExecuteDeleteAsync();
        await db.Set<AdminUser>().ExecuteDeleteAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            identity.ResetOwnerPasswordAsync("Recovered-test-password-123!", default));
    }

    [Fact]
    public async Task FirstOwnerIsUniqueHashOnlyAndCannotBeCreatedAgain()
    {
        using var scope = app.Services.CreateScope();
        var identity = scope.ServiceProvider.GetRequiredService<IAdminIdentity>();
        var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
        var owner = await db.Set<AdminUser>().SingleAsync();
        Assert.NotEqual(password, owner.PasswordHash);
        Assert.DoesNotContain(password, owner.PasswordHash);
        await Assert.ThrowsAsync<InvalidOperationException>(() => identity.CreateFirstOwnerAsync("other@example.invalid", password, default));
        Assert.NotNull(await identity.AuthenticateAsync(" OWNER@EXAMPLE.INVALID ", password, default));
    }
}

// Only TestServer controls the transport peer; no production header supplies this value.
internal sealed class TestPeerFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use(async (context, continuation) =>
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(context.Request.Headers["X-Test-Peer"].FirstOrDefault() ?? "203.0.113.10");
            if (context.Request.Headers["X-Test-Transport"] == "http") context.Request.Scheme = "http";
            context.Response.OnStarting(() =>
            {
                context.Response.Headers["X-Test-Observed-Peer"] = context.Connection.RemoteIpAddress?.ToString();
                context.Response.Headers["X-Test-Observed-Scheme"] = context.Request.Scheme;
                context.Response.Headers["X-Test-Observed-IsHttps"] = context.Request.IsHttps.ToString();
                return Task.CompletedTask;
            });
            await continuation();
        });
        next(app);
    };
}

internal sealed class LoginClock : TimeProvider
{
    private DateTimeOffset now = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => now;
    public void Advance(TimeSpan elapsed) => now += elapsed;
}
