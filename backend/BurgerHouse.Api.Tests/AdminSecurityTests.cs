using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BurgerHouse.Api.Admin;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
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
            builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
            builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={database}");
            builder.UseSetting("PagBank:Token", "test-placeholder");
            builder.UseSetting("PagBank:RedirectUrl", "https://example.invalid/");
            builder.UseSetting("PagBank:NotificationUrl", "https://example.invalid/webhook");
            builder.UseSetting("Admin:ForwardedHeaders:KnownProxies:0", "198.51.100.1");
            builder.UseSetting("Admin:ForwardedHeaders:KnownNetworks:0", "198.51.100.128/25");
            builder.ConfigureServices(services =>
            {
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
        Assert.Equal("Produto atualizado", products[0].GetProperty("name").GetString());
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
