using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Api.Tests;

public sealed class DevelopmentPaymentReconciliationTests
{
    [Theory]
    [InlineData("Development", true)]
    [InlineData("Production", false)]
    public async Task AutomaticReconciliationIsRegisteredOnlyInDevelopment(string environment, bool enabled)
    {
        var database = Path.Combine(Path.GetTempPath(), $"burger-reconciliation-registration-{Guid.NewGuid()}.db");
        try
        {
            await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment(environment);
                builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
                builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={database};Pooling=False");
                builder.UseSetting("PagBank:Token", "test-placeholder");
                builder.UseSetting("PagBank:RedirectUrl", "https://example.invalid/");
                builder.UseSetting("PagBank:NotificationUrl", "https://example.invalid/webhook");
                builder.ConfigureLogging(logging => logging.ClearProviders());
            });
            Assert.Equal(enabled, app.Services.GetServices<IHostedService>()
                .Any(service => service is DevelopmentPaymentReconciliationWorker));
            using var scope = app.Services.CreateScope();
            Assert.Equal(enabled, scope.ServiceProvider.GetService<PendingPaymentReconciliationBatch>() != null);
        }
        finally
        {
            foreach (var path in new[] { database, database + "-wal", database + "-shm" }) File.Delete(path);
        }
    }
}
