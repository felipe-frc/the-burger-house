using BurgerHouse.Infrastructure.Persistence;
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
}
