using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Api.Tests;

public sealed class CorsTests
{
    [Fact]
    public async Task LegacyTestStartupLeavesUnpreparedDatabaseUntouched()
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-unprepared-{Guid.NewGuid():N}.db");
        try
        {
            File.WriteAllBytes(path, []);
            await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("IntegrationTest");
                builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={path};Pooling=False");
                builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
                builder.UseSetting("PagBank:Token", "local-test-only");
                builder.UseSetting("PagBank:RedirectUrl", "https://example.invalid/");
                builder.UseSetting("PagBank:NotificationUrl", "https://example.invalid/webhook");
                builder.ConfigureLogging(logging => logging.ClearProviders());
            });
            var error = Assert.Throws<InvalidOperationException>(() => app.CreateClient());
            Assert.Contains("migration history", error.Message);
            Assert.Empty(File.ReadAllBytes(path));
        }
        finally { File.Delete(path); }
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task PublishedEnvironmentRejectsUnverifiedDatabaseBeforeOpeningConnection(string environment)
    {
        await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            builder.UseSetting("ConnectionStrings:DefaultConnection",
                "Host=127.0.0.1;Port=1;Database=unused;SSL Mode=Require");
        });
        var error = Assert.Throws<InvalidOperationException>(() => app.CreateClient());
        Assert.Contains("TLS", error.Message);
    }

    [Theory]
    [InlineData("Development", true)]
    [InlineData("IntegrationTest", false)]
    public async Task LocalOriginIsDevelopmentOnlyAndConfiguredOriginIsPreserved(string environment, bool allowLocal)
    {
        var database = Path.Combine(Path.GetTempPath(), $"burger-cors-{Guid.NewGuid()}.db");
        try
        {
            TestDatabase.Prepare(database);
            await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment(environment);
                builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
                builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={database};Pooling=False");
                builder.UseSetting("Cors:AllowedOrigins:0", "https://frontend.example.invalid");
                builder.UseSetting("PagBank:Token", "test-placeholder");
                builder.UseSetting("PagBank:RedirectUrl", "https://example.invalid/");
                builder.UseSetting("PagBank:NotificationUrl", "https://example.invalid/webhook");
                builder.ConfigureLogging(logging => logging.ClearProviders());
            });
            using var client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
            foreach (var (origin, allowed) in new[]
            {
                ("http://localhost:5173", allowLocal),
                ("http://localhost:3001", allowLocal),
                ("http://127.0.0.1:3001", allowLocal),
                ("https://frontend.example.invalid", true),
                ("https://untrusted.example.invalid", false)
            })
            {
                using var request = new HttpRequestMessage(HttpMethod.Options, "/api/orders");
                request.Headers.Add("Origin", origin);
                request.Headers.Add("Access-Control-Request-Method", "POST");
                request.Headers.Add("Access-Control-Request-Headers", "content-type,x-idempotency-key");
                using var response = await client.SendAsync(request);
                Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
                Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Origin"));
                Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
                if (allowed)
                {
                    Assert.Equal(origin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
                    Assert.Contains("POST", string.Join(",", response.Headers.GetValues("Access-Control-Allow-Methods")));
                    var headers = string.Join(",", response.Headers.GetValues("Access-Control-Allow-Headers"));
                    Assert.Contains("content-type", headers, StringComparison.OrdinalIgnoreCase);
                    Assert.Contains("x-idempotency-key", headers, StringComparison.OrdinalIgnoreCase);
                }
            }
        }
        finally
        {
            foreach (var path in new[] { database, database + "-wal", database + "-shm" }) File.Delete(path);
        }
    }
}
