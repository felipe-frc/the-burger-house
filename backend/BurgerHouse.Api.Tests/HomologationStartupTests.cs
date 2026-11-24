using System.Net;
using System.Net.Http.Json;
using BurgerHouse.Api;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Api.Tests;

public sealed class HomologationStartupTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task StartupRequiresExactHistoryWithoutMigratingAnExistingDatabase(bool outdated)
    {
        var root = Path.Combine(Path.GetTempPath(), "burgerhouse-homologation-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var connection = $"Data Source={Path.Combine(root, "burgerhouse.homologation.db")};Mode=ReadWrite;Pooling=False";
        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(connection.Replace("Mode=ReadWrite;", "Mode=ReadWriteCreate;")).Options;
        try
        {
            await using var db = new BurgerHouseDbContext(options, TestPersonalData.Protector);
            await db.GetService<IMigrator>().MigrateAsync(outdated ? "20261014205126_AddProductImageUrl" : null);
            var before = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
            await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Homologation");
                builder.UseSetting("Homologation:Root", root);
                builder.UseSetting("Database:Provider", "SQLite");
                builder.UseSetting("ConnectionStrings:DefaultConnection", connection);
                builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
                builder.UseSetting("Admin:DataProtectionPath", Path.Combine(root, "keys"));
                builder.UseSetting("AZURE_TRANSLATION_ENABLED", "false");
                builder.UseSetting("PagBank:Token", "synthetic-startup-test");
                builder.UseSetting("PagBank:BaseUrl", "https://sandbox.api.pagseguro.com");
                builder.UseSetting("PagBank:RedirectUrl", "https://localhost:4174/menu");
                builder.UseSetting("PagBank:NotificationUrl", " ");
                builder.UseSetting("PagBank:AllowUnsignedSandboxWebhooks", "false");
                builder.ConfigureLogging(logging => logging.ClearProviders());
            });
            if (outdated)
            {
                var error = Assert.Throws<InvalidOperationException>(() => app.CreateClient());
                Assert.Contains("Database migration history differs", error.Message);
                Assert.Equal(23, before.Length);
            }
            else
            {
                using var client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
                Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/health/ready")).StatusCode);
                var info = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/homologation/info");
                Assert.Equal("SQLite", info.GetProperty("provider").GetString());
                Assert.Equal(HomologationSafety.EnvironmentId(root), info.GetProperty("environmentId").GetString());
                Assert.Equal("burgerhouse.homologation.db", info.GetProperty("database").GetString());
                Assert.Equal(28, before.Length);
            }
            Assert.Equal(before, (await db.Database.GetAppliedMigrationsAsync()).ToArray());
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}
