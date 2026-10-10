using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Api.Tests;

public sealed class AdminSecurityTests : IAsyncLifetime
{
    private readonly string database = Path.Combine(Path.GetTempPath(), $"burger-admin-{Guid.NewGuid()}.db");
    private WebApplicationFactory<Program> app = null!;
    private HttpClient client = null!;
    private readonly string password = $"Test-only-{Guid.NewGuid()}";
    public async Task InitializeAsync()
    {
        app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={database}");
            builder.UseSetting("PagBank:Token", "test-placeholder");
            builder.UseSetting("PagBank:RedirectUrl", "https://example.invalid/");
            builder.UseSetting("PagBank:NotificationUrl", "https://example.invalid/webhook");
            builder.ConfigureLogging(logging => logging.ClearProviders());
        });
        client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        using var scope = app.Services.CreateScope();
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
    [InlineData("orders/1")]
    [InlineData("products")]
    [InlineData("store")]
    [InlineData("finance/summary")]
    [InlineData("finance/revenue")]
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
                    await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE Orders SET Street = 'Rua Legada Privada' WHERE Id = {order.Id}");
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
            foreach (var forbidden in new[] { "52998224725", "privado@teste.com", "customerTaxId", "customerEmail",
                "externalPaymentId", "externalCheckoutId", "idempotencyKey", "CHAR_privacy_", "CHEC_privacy_",
                "test-placeholder", "Authorization", "Bearer", "qr_code", "tax_id", "cardNumber", "cvv" }.Concat(keys))
                Assert.DoesNotContain(forbidden, text, StringComparison.OrdinalIgnoreCase);
            if (!path.StartsWith("orders/"))
                foreach (var field in new[] { "customerPhone", "zipCode", "street", "houseNumber", "neighborhood", "complement", "11999990000", "Rua Privada" })
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
    public async Task CsrfProtectsLoginAndAuthenticatedMutations()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/admin/auth/login",
            new { email = "owner@example.invalid", password })).StatusCode);
        await Login();
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync("/api/admin/products/1", new { price = 30, costPrice = 10, isActive = true })).StatusCode);
        await Token("me");
        Assert.Equal(HttpStatusCode.NoContent, (await client.PatchAsJsonAsync("/api/admin/products/1", new { price = 30, costPrice = 10, isActive = true, name = "must not change" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync("/api/admin/products/1", new { costPrice = 5 })).StatusCode);
        var products = await client.GetFromJsonAsync<JsonElement>("/api/admin/products");
        Assert.NotEqual("must not change", products[0].GetProperty("name").GetString());
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
