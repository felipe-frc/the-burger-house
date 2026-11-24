using System.Diagnostics;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Api.Tests;

// All HTTP API routes, application handlers, EF/SQLite and PagBank adapters are real.
// Only external PagBank HTTP responses are controlled. No real charge is created.
public sealed class StorefrontFlowTests
{
    [Theory]
    [InlineData("pickup", 0, "PIX", PaymentMethod.Pix)]
    [InlineData("delivery", 5, "CREDIT_CARD", PaymentMethod.CreditCard)]
    public async Task CatalogOrderCheckoutSignedWebhookAndAdminFulfillment(string fulfillment, decimal fee, string providerMethod, PaymentMethod method)
    {
        var database = Path.Combine(Path.GetTempPath(), $"burger-storefront-{Guid.NewGuid()}.db");
        using var signer = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var reference = "";
        var amount = 0;
        var refundedCents = 0;
        var creates = 0;
        var orderAccess = "";
        var paid = false;
        object Charge() => new
        {
            id = "CHAR_LOCAL", reference_id = reference, status = paid ? "PAID" : "WAITING",
            amount = new { value = amount, currency = "BRL", summary = new { total = amount, refunded = refundedCents } },
            payment_method = new { type = providerMethod }
        };
        Task<HttpResponseMessage> Provider(HttpRequestMessage request)
        {
            return Respond();
            async Task<HttpResponseMessage> Respond()
            {
                Assert.Equal("sandbox.api.pagseguro.com", request.RequestUri!.Host);
                object payload;
                if (request.RequestUri.AbsolutePath == "/public-keys/webhook")
                    payload = new { public_key = Convert.ToBase64String(signer.ExportSubjectPublicKeyInfo()) };
                else if (request.RequestUri.AbsolutePath.StartsWith("/charges/")) payload = Charge();
                else if (request.RequestUri.AbsolutePath.StartsWith("/orders/"))
                    payload = new { id = "ORDE_LOCAL", reference_id = reference, charges = paid ? new[] { Charge() } : Array.Empty<object>() };
                else
                {
                    if (request.Method == HttpMethod.Post)
                    {
                        creates++;
                        var body = await request.Content!.ReadFromJsonAsync<JsonElement>();
                        reference = body.GetProperty("reference_id").GetString()!;
                        amount = body.GetProperty("items")[0].GetProperty("unit_amount").GetInt32();
                    }
                    payload = new
                    {
                        id = "CHEC_LOCAL", reference_id = reference, status = "ACTIVE",
                        links = new[] { new { rel = "PAY", href = "https://pagamento.sandbox.pagbank.com.br/checkout/CHEC_LOCAL" } },
                        orders = paid ? new[] { new { id = "ORDE_LOCAL" } } : Array.Empty<object>()
                    };
                }
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(payload) };
            }
        }
        var pgConnection = TestDatabase.PrepareOperational(database);
        WebApplicationFactory<Program> CreateHost() => new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("IntegrationTest");
            builder.UseSetting("Database:Provider", pgConnection == null ? "Sqlite" : "PostgreSQL");
            builder.UseSetting("ConnectionStrings:DefaultConnection", pgConnection ?? $"Data Source={database}");
            builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
            builder.UseSetting("PagBank:BaseUrl", "https://sandbox.api.pagseguro.com/");
            builder.UseSetting("PagBank:Token", "local-test-only");
            builder.UseSetting("PagBank:RedirectUrl", "https://store.example.invalid/menu");
            builder.UseSetting("PagBank:NotificationUrl", "https://api.example.invalid/api/webhooks/pagbank");
            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureServices(services =>
            {
                services.AddHttpClient<PagBankCheckoutService>().ConfigurePrimaryHttpMessageHandler(() => new ProviderStub(Provider));
                services.AddHttpClient<PagBankPaymentLookup>().ConfigurePrimaryHttpMessageHandler(() => new ProviderStub(Provider));
                services.AddHttpClient(PagBankWebhookSignatureValidator.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => new ProviderStub(Provider));
            });
        });
        var app = CreateHost();
        try
        {
            using var client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
            var password = $"Local-only-{Guid.NewGuid()}";
            using (var scope = app.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
                // Seed a test-only product through the domain and the configured database.
                db.Products.Add(new Product("burger-flow-local", "Local flow burger", 43.9m));
                if (pgConnection != null)
                    db.Products.Add(new Product("burger-praiano", "O Praiano", 43.9m));
                if (Environment.GetEnvironmentVariable("TBH_BROWSER_APPROVED_CATALOG") == "1")
                {
                    var root = Path.GetFullPath(Path.Combine(
                        app.Services.GetRequiredService<IWebHostEnvironment>().ContentRootPath, "..", ".."));
                    using var catalog = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "scripts/admin/demo-catalog.json")));
                    foreach (var item in catalog.RootElement.GetProperty("products").EnumerateArray())
                    {
                        var product = Product.Create(item.GetProperty("code").GetString()!,
                            item.GetProperty("name").GetString()!, item.GetProperty("description").GetString()!,
                            item.GetProperty("price").GetDecimal(), null, true);
                        product.UpdateClassification(item.GetProperty("category").GetString()!, item.GetProperty("displayOrder").GetInt32());
                        db.Products.Add(product);
                    }
                }
                await db.SaveChangesAsync();
                if (Environment.GetEnvironmentVariable("TBH_BROWSER_CUSTOMIZATIONS") == "1")
                {
                    db.Add(new AddonOption { Code = "extra-cheese", Name = "Queijo Cheddar Extra", Price = 4.5m, IsActive = true, MaximumQuantity = 3 });
                    db.Add(new Coupon { Code = "BURGERTESTE10", IsActive = true, Percentage = 10, MinimumSubtotal = 30,
                        StartsAt = DateTime.UtcNow.AddMinutes(-1), ExpiresAt = DateTime.UtcNow.AddDays(30), UsageLimit = 100 });
                    await db.SaveChangesAsync();
                }
                await scope.ServiceProvider.GetRequiredService<IAdminIdentity>().CreateFirstOwnerAsync("owner@example.invalid", password, default);
            }
            async Task Token(string route)
            {
                var token = await client.GetFromJsonAsync<JsonElement>($"/api/admin/auth/{route}");
                client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
                client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token.GetProperty("csrfToken").GetString());
            }
            await Token("login");
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/admin/auth/login", new { email = "owner@example.invalid", password })).StatusCode);
            await Token("me");

            async Task AssertAfterRestartAsync(int expectedOrderId, int expectedPaymentId, decimal expectedTotal, PaymentStatus expectedPaymentStatus, OrderStatus expectedOrderStatus, decimal expectedRefunded)
            {
                int auditCount;
                using (var scope = app.Services.CreateScope())
                    auditCount = await scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>().AdminAuditLogs.CountAsync();
                await app.DisposeAsync();
                app = CreateHost();
                using var restarted = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
                var anonymous = await restarted.GetFromJsonAsync<JsonElement>("/api/admin/auth/login");
                restarted.DefaultRequestHeaders.Add("X-CSRF-TOKEN", anonymous.GetProperty("csrfToken").GetString());
                Assert.Equal(HttpStatusCode.OK, (await restarted.PostAsJsonAsync("/api/admin/auth/login", new { email = "owner@example.invalid", password })).StatusCode);
                restarted.DefaultRequestHeaders.Add("X-Order-Access", orderAccess);
                var payment = await restarted.GetFromJsonAsync<JsonElement>($"/api/payments/{expectedPaymentId}");
                Assert.Equal(expectedOrderId, payment.GetProperty("orderId").GetInt32());
                Assert.Equal((int)expectedPaymentStatus, payment.GetProperty("status").GetInt32());
                var finance = (await restarted.GetFromJsonAsync<FinanceSummary>("/api/admin/finance/summary?period=today"))!;
                Assert.Equal(expectedTotal, finance.GrossRevenue);
                Assert.Equal(1, finance.PaidOrders);
                Assert.Equal(expectedTotal, finance.AverageTicket);
                Assert.Equal(expectedTotal - expectedRefunded, finance.NetRevenue);
                using var verification = app.Services.CreateScope();
                var persistedDb = verification.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
                var savedPayment = Assert.Single(await persistedDb.Payments.ToListAsync());
                Assert.Equal(expectedTotal, savedPayment.Amount);
                Assert.Equal(expectedRefunded, savedPayment.RefundedAmount);
                Assert.Equal(expectedOrderStatus, (await persistedDb.Orders.SingleAsync(o => o.Id == expectedOrderId)).Status);
                Assert.Equal(auditCount, await persistedDb.AdminAuditLogs.CountAsync());
            }

            async Task<HttpResponseMessage> Webhook(bool signed)
            {
                var bytes = JsonSerializer.SerializeToUtf8Bytes(new { id = "ORDE_LOCAL", reference_id = reference, charges = new[] { Charge() } });
                using var request = new HttpRequestMessage(HttpMethod.Post, "/api/webhooks/pagbank") { Content = new StringContent(Encoding.UTF8.GetString(bytes), Encoding.UTF8, "application/json") };
                if (signed) request.Headers.Add("x-payload-signature", Convert.ToBase64String(signer.SignData(bytes, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence)));
                return await client.SendAsync(request);
            }
            if (Environment.GetEnvironmentVariable("TBH_BROWSER_WITH_CONTROLLED_PROVIDER") == "1")
            {
                var browserClient = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
                using (browserClient)
                {
                    await RunChromiumAsync(browserClient, fulfillment,
                        app.Services.GetRequiredService<IWebHostEnvironment>().ContentRootPath, async () =>
                        {
                            await AssertOwnerPendingOrderAsync(client);
                            paid = true;
                            using var result = await Webhook(true);
                            return result.StatusCode;
                        });
                }
                Assert.Equal(1, creates);
                using var browserVerification = app.Services.CreateScope();
                var databaseContext = browserVerification.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
                var confirmed = Assert.Single(await databaseContext.Payments.ToListAsync());
                Assert.Equal(PaymentStatus.Approved, confirmed.Status);
                var catalogCheckout = Environment.GetEnvironmentVariable("TBH_BROWSER_APPROVED_CATALOG") == "1";
                var customized = Environment.GetEnvironmentVariable("TBH_BROWSER_CUSTOMIZATIONS") == "1";
                Assert.Equal((customized ? 140.40m : catalogCheckout ? 151.50m : 43.90m) + fee, confirmed.Amount);
                if (catalogCheckout)
                {
                    var lines = await databaseContext.OrderItems.Where(item => EF.Property<int>(item, "OrderId") == confirmed.OrderId).ToListAsync();
                    Assert.Equal(5, lines.Count);
                    Assert.Equal(new[] { 5.90m, 23.90m, customized ? 39.40m : 34.90m, 42.90m, 43.90m },
                        lines.Select(item => item.UnitPrice).OrderBy(price => price).ToArray());
                }
                await AssertOwnerPaidOrderAsync(client, confirmed.OrderId, confirmed.Amount);
                if (customized)
                {
                    var customizedOrder = await databaseContext.Orders.Include(order => order.Items).SingleAsync(order => order.Id == confirmed.OrderId);
                    Assert.Equal("BURGERTESTE10", customizedOrder.CouponCode);
                    Assert.Equal(15.60m, customizedOrder.Discount);
                    Assert.Equal(customizedOrder.Discount, customizedOrder.Items.Sum(item => item.DiscountAmount));
                    Assert.Contains(customizedOrder.Items, item => item.Observation != null && item.Observation.Contains("Queijo Cheddar Extra") && item.Observation.Contains("Sem cebola"));
                    var customizedEndpoint = $"/api/admin/orders/{confirmed.OrderId}/status";
                    Assert.Equal(HttpStatusCode.NoContent, (await client.PatchAsJsonAsync(customizedEndpoint, new { expectedStatus = "Received", status = "Preparing" })).StatusCode);
                    var kitchen = (await client.GetFromJsonAsync<Page<OperationalOrder>>("/api/admin/orders/operational?Status=Preparing"))!;
                    Assert.Contains(Assert.Single(kitchen.Items).Items, item => item.Observation != null && item.Observation.Contains("Queijo Cheddar Extra"));
                    Assert.Equal(HttpStatusCode.NoContent, (await client.PatchAsJsonAsync(customizedEndpoint, new { expectedStatus = "Preparing", status = "ReadyForPickup" })).StatusCode);
                    var customizedTarget = fulfillment == "delivery" ? "OutForDelivery" : "Completed";
                    Assert.Equal(HttpStatusCode.NoContent, (await client.PatchAsJsonAsync(customizedEndpoint, new {
                        expectedStatus = "ReadyForPickup", status = customizedTarget,
                        checklist = new { items = true, packaging = true, identification = true }
                    })).StatusCode);
                    if (fulfillment == "delivery")
                        Assert.Equal(HttpStatusCode.NoContent, (await client.PatchAsJsonAsync(customizedEndpoint, new { expectedStatus = "OutForDelivery", status = "Completed" })).StatusCode);
                    databaseContext.ChangeTracker.Clear();
                    Assert.Equal(OrderStatus.Completed, (await databaseContext.Orders.SingleAsync(order => order.Id == confirmed.OrderId)).Status);
                }
                await AssertAfterRestartAsync(confirmed.OrderId, confirmed.Id, confirmed.Amount, PaymentStatus.Approved,
                    customized ? OrderStatus.Completed : OrderStatus.Received, 0);
                return;
            }
            var products = await client.GetFromJsonAsync<JsonElement>("/api/products");
            Assert.Contains(products.EnumerateArray(), p => p.GetProperty("code").GetString() == "burger-flow-local");
            var response = await client.PostAsJsonAsync("/api/orders", new
            {
                orderType = fulfillment, customerName = "Cliente Teste", customerPhone = "11999990000",
                customerEmail = "cliente@example.com", customerTaxId = "52998224725",
                zipCode = "38400-000", street = "Rua Teste", houseNumber = "10", neighborhood = "Centro", city = "Uberlândia",
                total = 0.01m, // Browser-supplied money must never override official prices.
                items = new[] { new { productCode = "burger-flow-local", quantity = 2, unitPrice = 0.01m } }
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var order = await response.Content.ReadFromJsonAsync<JsonElement>();
            var orderId = order.GetProperty("orderId").GetInt32();
            orderAccess = order.GetProperty("orderAccessToken").GetString()!;
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/checkout/{orderId}", null)).StatusCode);
            Assert.Equal(0, creates);
            client.DefaultRequestHeaders.Add("X-Order-Access", orderAccess);
            var total = 87.8m + fee;
            Assert.Equal(total, order.GetProperty("total").GetDecimal());
            Assert.Equal(fee, order.GetProperty("deliveryFee").GetDecimal());
            var checkout = await client.PostAsync($"/api/checkout/{orderId}", null);
            Assert.Equal(HttpStatusCode.OK, checkout.StatusCode);
            var session = await checkout.Content.ReadFromJsonAsync<JsonElement>();
            var paymentId = session.GetProperty("paymentId").GetInt32();
            Assert.Equal($"payment:{paymentId}", reference);
            Assert.Equal((int)(total * 100), amount);
            var retry = await client.PostAsync($"/api/checkout/{orderId}", null);
            Assert.Equal(paymentId, (await retry.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("paymentId").GetInt32());
            Assert.Equal(1, creates);
            client.DefaultRequestHeaders.Remove("X-Order-Access");
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/payments/{paymentId}")).StatusCode);
            var access = app.Services.GetRequiredService<BurgerHouse.Api.Security.PublicOrderAccess>();
            client.DefaultRequestHeaders.Add("X-Order-Access", access.Issue(orderId + 1));
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/payments/{paymentId}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/checkout/{orderId}", null)).StatusCode);
            Assert.Equal(1, creates);
            client.DefaultRequestHeaders.Remove("X-Order-Access");
            client.DefaultRequestHeaders.Add("X-Order-Access", orderAccess);
            var pending = await client.GetFromJsonAsync<JsonElement>($"/api/payments/{paymentId}?status=approved");
            Assert.Equal((int)PaymentStatus.Pending, pending.GetProperty("status").GetInt32());
            await AssertOwnerPendingOrderAsync(client);
            paid = true;
            Assert.Equal(HttpStatusCode.Unauthorized, (await Webhook(false)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await Webhook(true)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await Webhook(true)).StatusCode);
            var approved = await client.GetFromJsonAsync<JsonElement>($"/api/payments/{paymentId}");
            Assert.Equal((int)PaymentStatus.Approved, approved.GetProperty("status").GetInt32());
            Assert.Equal(total, approved.GetProperty("amount").GetDecimal());
            await AssertOwnerPaidOrderAsync(client, orderId, total);
            var contentRoot = app.Services.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>().ContentRootPath;
            using var planned = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(contentRoot, "..", "..", "scripts", "admin", "missing-products.json")));
            Assert.Equal(10, planned.RootElement.GetArrayLength());
            foreach (var product in planned.RootElement.EnumerateArray())
                Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/admin/products", product)).StatusCode);
            var catalogAfterRegistration = await client.GetFromJsonAsync<JsonElement>("/api/products");
            foreach (var expected in planned.RootElement.EnumerateArray())
            {
                var registered = Assert.Single(catalogAfterRegistration.EnumerateArray(), p => p.GetProperty("name").GetString() == expected.GetProperty("name").GetString());
                Assert.Equal(expected.GetProperty("price").GetDecimal(), registered.GetProperty("price").GetDecimal());
                Assert.Equal(expected.GetProperty("category").GetString(), registered.GetProperty("category").GetString());
                Assert.True(registered.GetProperty("isActive").GetBoolean());
                Assert.False(string.IsNullOrWhiteSpace(registered.GetProperty("code").GetString()));
            }
            var detail = await client.GetFromJsonAsync<JsonElement>($"/api/admin/orders/{orderId}");
            Assert.Equal("Received", detail.GetProperty("order").GetProperty("status").GetString());
            var profiles = await client.GetFromJsonAsync<JsonElement>($"/api/admin/customers?search={orderId}");
            var profile = Assert.Single(profiles.EnumerateArray());
            Assert.Equal("Cliente Teste", profile.GetProperty("name").GetString());
            var purchase = Assert.Single(profile.GetProperty("purchases").EnumerateArray());
            Assert.Equal(orderId, purchase.GetProperty("orderId").GetInt32());
            Assert.False(profile.TryGetProperty("customerTaxId", out _));
            using var secondOwner = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
            var secondLogin = await secondOwner.GetFromJsonAsync<JsonElement>("/api/admin/auth/login");
            secondOwner.DefaultRequestHeaders.Add("X-CSRF-TOKEN", secondLogin.GetProperty("csrfToken").GetString());
            Assert.Equal(HttpStatusCode.OK, (await secondOwner.PostAsJsonAsync("/api/admin/auth/login", new { email = "owner@example.invalid", password })).StatusCode);
            var secondSession = await secondOwner.GetFromJsonAsync<JsonElement>("/api/admin/auth/me");
            secondOwner.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
            secondOwner.DefaultRequestHeaders.Add("X-CSRF-TOKEN", secondSession.GetProperty("csrfToken").GetString());
            var transition = new { expectedStatus = "Received", status = "Preparing" };
            var attempts = await Task.WhenAll(
                client.PatchAsJsonAsync($"/api/admin/orders/{orderId}/status", transition),
                secondOwner.PatchAsJsonAsync($"/api/admin/orders/{orderId}/status", transition));
            Assert.Single(attempts, response => response.StatusCode == HttpStatusCode.NoContent);
            Assert.Single(attempts, response => response.StatusCode == HttpStatusCode.Conflict);
            var updated = await client.GetFromJsonAsync<JsonElement>($"/api/admin/orders/{orderId}");
            Assert.Equal("Preparing", updated.GetProperty("order").GetProperty("status").GetString());
            Assert.True(updated.GetProperty("order").GetProperty("stageStartedAt").TryGetDateTime(out _));
            var endpoint = $"/api/admin/orders/{orderId}/status";
            Assert.Equal(HttpStatusCode.NoContent, (await client.PatchAsJsonAsync(endpoint, new { expectedStatus = "Preparing", status = "ReadyForPickup" })).StatusCode);
            var target = fulfillment == "delivery" ? OrderStatus.OutForDelivery : OrderStatus.Completed;
            var dispatch = new { expectedStatus = "ReadyForPickup", status = target.ToString() };
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync(endpoint, dispatch)).StatusCode);
            var checkedDispatch = new { dispatch.expectedStatus, dispatch.status, checklist = new { items = true, packaging = true, identification = true } };
            Assert.Equal(HttpStatusCode.NoContent, (await client.PatchAsJsonAsync(endpoint, checkedDispatch)).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await secondOwner.PatchAsJsonAsync(endpoint, checkedDispatch)).StatusCode);
            if (target == OrderStatus.OutForDelivery)
                Assert.Equal(HttpStatusCode.NoContent, (await client.PatchAsJsonAsync(endpoint,
                    new { expectedStatus = "OutForDelivery", status = "Completed" })).StatusCode);
            var settings = "/api/admin/operation/settings";
            var firstConfig = await client.GetFromJsonAsync<JsonElement>(settings);
            var revision = firstConfig.GetProperty("revision").GetInt32();
            var config = new { revision, limits = new { preparing = 20, readyForPickup = 8, outForDelivery = 35 } };
            Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync(settings, config)).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await secondOwner.PutAsJsonAsync(settings, config)).StatusCode);
            var savedConfig = await secondOwner.GetFromJsonAsync<JsonElement>(settings);
            Assert.Equal(20, savedConfig.GetProperty("limits").GetProperty("preparing").GetInt32());
            using var verification = app.Services.CreateScope();
            var saved = verification.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
            var persisted = Assert.Single(await saved.Payments.Where(p => p.OrderId == orderId).ToListAsync());
            Assert.Equal(method, persisted.Method);
            var summary = (await client.GetFromJsonAsync<FinanceSummary>("/api/admin/finance/summary?period=today"))!;
            Assert.Equal(persisted.Amount, summary.NetRevenue);
            Assert.Equal(persisted.Amount, summary.AverageTicket);
            Assert.Equal(1, summary.PaidOrders);
            Assert.Equal(fulfillment == "delivery" ? 4 : 3, await saved.AdminAuditLogs.CountAsync(log => log.Action == "OrderStatusChanged" && log.EntityId == orderId.ToString()));
            Assert.Equal(OrderStatus.Completed, (await saved.Orders.SingleAsync(o => o.Id == orderId)).Status);
            foreach (var refund in new[] { 100, amount })
            {
                refundedCents = refund;
                Assert.Equal(HttpStatusCode.OK, (await Webhook(true)).StatusCode);
                Assert.Equal(HttpStatusCode.OK, (await Webhook(true)).StatusCode);
                var finance = (await client.GetFromJsonAsync<FinanceSummary>("/api/admin/finance/summary?period=today"))!;
                Assert.Equal(total, finance.GrossRevenue);
                Assert.Equal(refund / 100m, finance.RefundedAmount);
                Assert.Equal(total - refund / 100m, finance.NetRevenue);
                Assert.Equal(finance.RefundedAmount, await saved.PaymentRefunds.SumAsync(row => row.Amount));
            }
            await AssertAfterRestartAsync(orderId, paymentId, total, PaymentStatus.Refunded, OrderStatus.Completed, total);
        }
        finally
        {
            await app.DisposeAsync();
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            foreach (var path in new[] { database, database + "-shm", database + "-wal" }) File.Delete(path);
        }
    }

    private static async Task AssertOwnerPendingOrderAsync(HttpClient client)
    {
        var finance = (await client.GetFromJsonAsync<FinanceSummary>("/api/admin/finance/summary?period=today"))!;
        Assert.Equal(0, finance.GrossRevenue);
        Assert.Equal(0, finance.PaidOrders);
        var pending = (await client.GetFromJsonAsync<Page<OrderRow>>("/api/admin/orders?Status=PendingPayment"))!;
        Assert.Equal("Pending", Assert.Single(pending.Items).PaymentStatus);
        var inbox = (await client.GetFromJsonAsync<NotificationInbox>("/api/admin/notifications/inbox"))!;
        Assert.Empty(inbox.Items);
        Assert.Equal(0, inbox.UnreadCount);
    }

    private static async Task AssertOwnerPaidOrderAsync(HttpClient client, int orderId, decimal total)
    {
        var operational = (await client.GetFromJsonAsync<Page<OperationalOrder>>("/api/admin/orders/operational?Status=Received"))!;
        var order = Assert.Single(operational.Items).Order;
        Assert.Equal(orderId, order.Id);
        Assert.Equal("Approved", order.PaymentStatus);
        Assert.Equal(total, order.Total);
        var dashboard = (await client.GetFromJsonAsync<Dashboard>("/api/admin/dashboard"))!;
        Assert.Equal(total, dashboard.Today.GrossRevenue);
        Assert.Equal(1, dashboard.Today.PaidOrders);
        Assert.Equal(order, Assert.Single(dashboard.RecentOrders));
        var inbox = (await client.GetFromJsonAsync<NotificationInbox>("/api/admin/notifications/inbox"))!;
        Assert.Equal(orderId, Assert.Single(inbox.Items).Id);
        Assert.Equal(1, inbox.UnreadCount);
    }

    // Test-only HTTP bridge through the already isolated TestServer. No administrative or external route is exposed.
    private static async Task RunChromiumAsync(HttpClient client, string fulfillment, string contentRoot,
        Func<Task<HttpStatusCode>> approve)
    {
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { Args = [] });
        builder.Configuration.Sources.Clear();
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
        await using var bridge = builder.Build();
        bridge.Run(async context =>
        {
            var method = context.Request.Method;
            var path = context.Request.Path.Value ?? "";
            if (method == "POST" && path == "/__acceptance/approve")
            {
                context.Response.StatusCode = (int)await approve();
                return;
            }

            var allowed = (method, path) is ("GET", "/api/products") or ("GET", "/api/products/extras") or
                ("POST", "/api/orders") or ("POST", "/api/orders/quote") ||
                (method == "POST" && System.Text.RegularExpressions.Regex.IsMatch(path, "^/api/checkout/[0-9]+$")) ||
                (method == "GET" && System.Text.RegularExpressions.Regex.IsMatch(path, "^/api/payments/[0-9]+$"));
            if (!allowed)
            {
                context.Response.StatusCode = 403;
                return;
            }

            using var request = new HttpRequestMessage(new HttpMethod(method), path);
            if (context.Request.ContentLength > 0)
            {
                request.Content = new StreamContent(context.Request.Body);
                if (context.Request.ContentType != null)
                    request.Content.Headers.TryAddWithoutValidation("Content-Type", context.Request.ContentType);
            }
            using var result = await client.SendAsync(request, context.RequestAborted);
            context.Response.StatusCode = (int)result.StatusCode;
            context.Response.ContentType = result.Content.Headers.ContentType?.ToString();
            await result.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
        });

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(75));
        await bridge.StartAsync(timeout.Token);
        var root = Path.GetFullPath(Path.Combine(contentRoot, "..", ".."));
        var start = new ProcessStartInfo("node")
        {
            WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
        };
        start.ArgumentList.Add(Path.Combine(root, "tests", "storefront-browser-controlled-payment.mjs"));
        start.ArgumentList.Add(bridge.Urls.Single());
        start.ArgumentList.Add(fulfillment);
        using var browser = Process.Start(start) ?? throw new InvalidOperationException("Node did not start.");
        var output = browser.StandardOutput.ReadToEndAsync();
        var errors = browser.StandardError.ReadToEndAsync();
        try
        {
            await browser.WaitForExitAsync(timeout.Token);
            Assert.True(browser.ExitCode == 0, await errors);
            Assert.Contains("Checkout Chromium:", await output);
        }
        finally
        {
            if (!browser.HasExited) browser.Kill(entireProcessTree: true);
            await bridge.StopAsync();
        }
    }

    private sealed class ProviderStub(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }
}
