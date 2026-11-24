using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Api.Tests;

public sealed class PendingPaymentReconciliationRegistrationTests
{
    [Theory]
    [InlineData("Development")]
    [InlineData("IntegrationTest")]
    public async Task AutomaticReconciliationRunsAlongsideExpiration(string environment)
    {
        var database = Path.Combine(Path.GetTempPath(), $"burger-reconciliation-registration-{Guid.NewGuid()}.db");
        try
        {
            TestDatabase.Prepare(database);
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
            var workers = app.Services.GetServices<IHostedService>();
            Assert.Single(workers.OfType<PendingPaymentReconciliationWorker>());
            Assert.Single(workers.OfType<PendingPaymentExpirationWorker>());
            using var scope = app.Services.CreateScope();
            Assert.NotNull(scope.ServiceProvider.GetService<PendingPaymentReconciliationBatch>());
        }
        finally
        {
            foreach (var path in new[] { database, database + "-wal", database + "-shm" }) File.Delete(path);
        }
    }
}
