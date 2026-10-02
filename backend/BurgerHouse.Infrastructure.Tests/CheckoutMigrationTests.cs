using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BurgerHouse.Infrastructure.Tests;

public class CheckoutMigrationTests
{
    private const string PreviousMigration = "20260930221447_AddPaymentProviderAndPagBankCheckout";

    [Fact]
    public async Task FinalMigrationRemovesObsoleteColumnsAndPreservesPaymentIdentifiers()
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-final-migration-{Guid.NewGuid()}.db");
        try
        {
            await using var db = CreateContext(path);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync(PreviousMigration);
            await SeedPaymentBeforeFinalMigration(db);

            await migrator.MigrateAsync();
            db.ChangeTracker.Clear();

            var payment = await db.Payments.SingleAsync();
            Assert.Equal("CHEC_preserved", payment.ExternalCheckoutId);
            Assert.Equal("CHAR_preserved", payment.ExternalPaymentId);
            Assert.Equal("22222222-2222-4222-8222-222222222222", payment.IdempotencyKey);
            Assert.Equal("historical-order", await ScalarString(db, "SELECT ExternalOrderId AS Value FROM Payments"));

            var columns = await db.Database
                .SqlQueryRaw<string>("SELECT name AS Value FROM pragma_table_info('Payments')")
                .ToListAsync();
            Assert.DoesNotContain("Provider", columns);
            Assert.DoesNotContain("ExternalPreferenceId", columns);
            Assert.Contains("ExternalCheckoutId", columns);
            Assert.Contains("ExternalPaymentId", columns);
            Assert.Contains("IdempotencyKey", columns);
            Assert.Contains("ExternalOrderId", columns);
            Assert.Equal(1, await db.Database
                .SqlQueryRaw<int>("SELECT [unique] AS Value FROM pragma_index_list('Payments') WHERE name = 'IX_Payments_ExternalCheckoutId'")
                .SingleAsync());
            Assert.Equal("ExternalCheckoutId", await ScalarString(
                db,
                "SELECT group_concat(name, ',') AS Value FROM pragma_index_info('IX_Payments_ExternalCheckoutId')"));
            Assert.False(db.Database.HasPendingModelChanges());
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task FinalMigrationRollbackRestoresOldShapeWithoutLosingPreservedData()
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-final-rollback-{Guid.NewGuid()}.db");
        try
        {
            await using var db = CreateContext(path);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync(PreviousMigration);
            await SeedPaymentBeforeFinalMigration(db);
            await migrator.MigrateAsync();

            await migrator.MigrateAsync(PreviousMigration);

            var columns = await db.Database
                .SqlQueryRaw<string>("SELECT name AS Value FROM pragma_table_info('Payments')")
                .ToListAsync();
            Assert.Contains("Provider", columns);
            Assert.Contains("ExternalPreferenceId", columns);
            Assert.Contains("ExternalOrderId", columns);
            Assert.Equal(2, await db.Database
                .SqlQueryRaw<int>("SELECT Provider AS Value FROM Payments")
                .SingleAsync());
            Assert.Equal("CHEC_preserved", await ScalarString(db, "SELECT ExternalCheckoutId AS Value FROM Payments"));
            Assert.Equal("CHAR_preserved", await ScalarString(db, "SELECT ExternalPaymentId AS Value FROM Payments"));
            Assert.Equal("historical-order", await ScalarString(db, "SELECT ExternalOrderId AS Value FROM Payments"));
            Assert.Equal("22222222-2222-4222-8222-222222222222", await ScalarString(
                db,
                "SELECT IdempotencyKey AS Value FROM Payments"));
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task FreshDatabaseAppliesCompleteMigrationChain()
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-fresh-migration-{Guid.NewGuid()}.db");
        try
        {
            await using var db = CreateContext(path);

            await db.Database.MigrateAsync();

            var applied = await db.Database.GetAppliedMigrationsAsync();
            Assert.Contains(applied, migration => migration.EndsWith("RemoveMercadoPagoProvider", StringComparison.Ordinal));
            Assert.False(db.Database.HasPendingModelChanges());
        }
        finally
        {
            File.Delete(path);
        }
    }

    private static BurgerHouseDbContext CreateContext(string path) => new(
        new DbContextOptionsBuilder<BurgerHouseDbContext>()
            .UseSqlite($"Data Source={path};Pooling=False")
            .Options);

    private static async Task SeedPaymentBeforeFinalMigration(BurgerHouseDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO Orders (Id,DeliveryFee,Status,CreatedAt) VALUES (1,'0',1,'2026-10-01')");
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO Payments " +
            "(OrderId,Amount,Status,Method,IdempotencyKey,ExternalPaymentId,ExternalPreferenceId,ExternalCheckoutId,Provider,ExternalOrderId,CreatedAt) " +
            "VALUES (1,'43.9',1,0,'22222222-2222-4222-8222-222222222222','CHAR_preserved','obsolete-preference','CHEC_preserved',2,'historical-order','2026-10-01')");
    }

    private static Task<string> ScalarString(BurgerHouseDbContext db, string sql) =>
        db.Database.SqlQueryRaw<string>(sql).SingleAsync();
}
