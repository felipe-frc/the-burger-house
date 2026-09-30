using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BurgerHouse.Infrastructure.Tests;

public class CheckoutMigrationTests
{
    [Fact]
    public async Task AddingPreferencePreservesHistoricalOrderIdsAndPaymentMethodDefault()
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-migration-{Guid.NewGuid()}.db");
        try
        {
            await using var db = new BurgerHouseDbContext(new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite($"Data Source={path};Pooling=False").Options);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20260916221425_RemovePaymentMethodDefault");
            await db.Database.ExecuteSqlRawAsync("INSERT INTO Orders (Id,DeliveryFee,Status,CreatedAt) VALUES (1,'0',1,'2026-09-16')");
            await db.Database.ExecuteSqlRawAsync("INSERT INTO Payments (OrderId,Amount,Status,Method,IdempotencyKey,CreatedAt,ExternalOrderId) VALUES (1,'43.9',2,1,'11111111-1111-4111-8111-111111111111','2026-09-16','historical-order')");
            await migrator.MigrateAsync();
            Assert.Equal("historical-order", await db.Database.SqlQueryRaw<string>("SELECT ExternalOrderId AS Value FROM Payments").SingleAsync());
            Assert.Null((await db.Payments.SingleAsync()).ExternalPreferenceId);
            Assert.False(db.Database.HasPendingModelChanges());
            await migrator.MigrateAsync("20260916221425_RemovePaymentMethodDefault");
            Assert.Equal("historical-order", await db.Database.SqlQueryRaw<string>("SELECT ExternalOrderId AS Value FROM Payments").SingleAsync());
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task AddingProviderBackfillsMercadoPagoAndPreservesEveryHistoricalIdentity()
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-pagbank-migration-{Guid.NewGuid()}.db");
        try
        {
            await using var db = new BurgerHouseDbContext(new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite($"Data Source={path};Pooling=False").Options);
            var migrator = db.GetService<IMigrator>();
            const string previousMigration = "20260916232938_AddCheckoutPreference";
            await migrator.MigrateAsync(previousMigration);
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO Orders (Id,DeliveryFee,Status,CreatedAt) VALUES (1,'0',1,'2026-09-30')");
            await db.Database.ExecuteSqlRawAsync(
                "INSERT INTO Payments " +
                "(OrderId,Amount,Status,Method,IdempotencyKey,ExternalPaymentId,ExternalPreferenceId,ExternalOrderId,CreatedAt) " +
                "VALUES (1,'43.9',3,1,'22222222-2222-4222-8222-222222222222','mp-payment','mp-preference','historical-order','2026-09-30')");

            await migrator.MigrateAsync();
            db.ChangeTracker.Clear();

            var payment = await db.Payments.SingleAsync();
            Assert.Equal(PaymentProvider.MercadoPago, payment.Provider);
            Assert.Equal("mp-payment", payment.ExternalPaymentId);
            Assert.Equal("mp-preference", payment.ExternalPreferenceId);
            Assert.Null(payment.ExternalCheckoutId);
            Assert.Equal("historical-order", await db.Database
                .SqlQueryRaw<string>("SELECT ExternalOrderId AS Value FROM Payments")
                .SingleAsync());
            var columns = await db.Database
                .SqlQueryRaw<string>("SELECT name AS Value FROM pragma_table_info('Payments')")
                .ToListAsync();
            Assert.Contains("Provider", columns);
            Assert.Contains("ExternalCheckoutId", columns);
            Assert.Contains("ExternalOrderId", columns);
            Assert.Equal(1, await db.Database
                .SqlQueryRaw<int>("SELECT [unique] AS Value FROM pragma_index_list('Payments') WHERE name = 'IX_Payments_Provider_ExternalCheckoutId'")
                .SingleAsync());
            Assert.Equal("Provider,ExternalCheckoutId", await db.Database
                .SqlQueryRaw<string>("SELECT group_concat(name, ',') AS Value FROM pragma_index_info('IX_Payments_Provider_ExternalCheckoutId')")
                .SingleAsync());
            Assert.False(db.Database.HasPendingModelChanges());

            await migrator.MigrateAsync(previousMigration);
            Assert.Equal("historical-order", await db.Database
                .SqlQueryRaw<string>("SELECT ExternalOrderId AS Value FROM Payments")
                .SingleAsync());
            Assert.Equal("mp-preference", await db.Database
                .SqlQueryRaw<string>("SELECT ExternalPreferenceId AS Value FROM Payments")
                .SingleAsync());
            Assert.Equal("mp-payment", await db.Database
                .SqlQueryRaw<string>("SELECT ExternalPaymentId AS Value FROM Payments")
                .SingleAsync());
        }
        finally { File.Delete(path); }
    }
}
