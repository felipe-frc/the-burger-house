using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BurgerHouse.Infrastructure.Tests;

public class CheckoutMigrationTests
{
    [Theory]
    [InlineData(2, true)]
    [InlineData(5, false)]
    [InlineData(6, false)]
    [InlineData(7, false)]
    public async Task FinancialMigrationPreservesLegacyDataAndDoesNotInventRefundEvents(int status, bool estimated)
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-financial-migration-{Guid.NewGuid()}.db");
        try
        {
            await using var db = CreateContext(path);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync(PreviousMigration);
            await SeedPaymentBeforeFinalMigration(db);
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE Payments SET Status = {status}, UpdatedAt = '2026-10-05 15:00:00'");
            await migrator.MigrateAsync();
            var payment = await db.Payments.SingleAsync();
            Assert.Equal(estimated, payment.ApprovedAt.HasValue);
            if (estimated) Assert.Equal(new DateTime(2026, 10, 5, 15, 0, 0), payment.ApprovedAt);
            Assert.Equal(estimated ? ApprovalDateSource.LegacyEstimate : ApprovalDateSource.Unknown, payment.ApprovalDateSource);
            Assert.Null(payment.RefundTrackingStartedAt); Assert.Equal(0, payment.RefundedAmount);
            Assert.Empty(await db.PaymentRefunds.ToListAsync());
            Assert.Equal("historical-order", await ScalarString(db, "SELECT ExternalOrderId AS Value FROM Payments"));
            Assert.False(db.Database.HasPendingModelChanges());
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM pragma_foreign_key_list('PaymentRefunds') WHERE [table] = 'Payments'").SingleAsync());
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT [unique] AS Value FROM pragma_index_list('PaymentRefunds') WHERE name = 'IX_PaymentRefunds_PaymentId_CumulativeRefundedAmount'").SingleAsync());
            await Assert.ThrowsAsync<Microsoft.Data.Sqlite.SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "INSERT INTO PaymentRefunds(PaymentId,Amount,CumulativeRefundedAmount,CreatedAt) VALUES(1,'-1','1','2026-10-05')"));
            await Assert.ThrowsAsync<Microsoft.Data.Sqlite.SqliteException>(() => db.Database.ExecuteSqlRawAsync(
                "INSERT INTO PaymentRefunds(PaymentId,Amount,CumulativeRefundedAmount,CreatedAt) VALUES(999,'1','1','2026-10-05')"));
            await migrator.MigrateAsync("20261008004030_AddCustomerPaymentIdentity");
            Assert.Equal("historical-order", await ScalarString(db, "SELECT ExternalOrderId AS Value FROM Payments"));
            Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM Payments").SingleAsync());
        }
        finally { File.Delete(path); }
    }

    [Theory]
    [InlineData(30)]
    [InlineData(50)]
    public async Task SqliteConcurrencyRejectsStaleDeltaAndReloadComputesCorrectIncrement(decimal secondTotal)
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-refund-race-{Guid.NewGuid()}.db");
        try
        {
            await SeedFinancialPayment(path);
            await using var first = CreateContext(path);
            await using var second = CreateContext(path);
            var a = await first.Payments.SingleAsync();
            var b = await second.Payments.SingleAsync();
            a.Refund(true); a.RecordRefundTotal(30);
            b.Refund(true); b.RecordRefundTotal(secondTotal);
            await first.SaveChangesAsync();
            await Assert.ThrowsAnyAsync<DbUpdateException>(() => second.SaveChangesAsync());
            second.ChangeTracker.Clear();
            b = await second.Payments.SingleAsync();
            Assert.Equal(30, b.RefundedAmount);
            Assert.Equal(30, await second.PaymentRefunds.SumAsync(r => r.Amount));
            b.RecordRefundTotal(secondTotal);
            await second.SaveChangesAsync();
            Assert.Equal(secondTotal, await second.PaymentRefunds.SumAsync(r => r.Amount));
            Assert.Equal(secondTotal == 30 ? 1 : 2, await second.PaymentRefunds.CountAsync());
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task RefundInsertFailureRollsBackPaymentAndHistoryTogether()
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-refund-rollback-{Guid.NewGuid()}.db");
        try
        {
            await SeedFinancialPayment(path);
            await using var db = CreateContext(path);
            await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER fail_refund BEFORE INSERT ON PaymentRefunds BEGIN SELECT RAISE(ABORT, 'test failure'); END");
            var payment = await db.Payments.SingleAsync();
            var approved = payment.ApprovedAt;
            payment.Refund(true); payment.RecordRefundTotal(30);
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            db.ChangeTracker.Clear();
            payment = await db.Payments.SingleAsync();
            Assert.Equal(PaymentStatus.Approved, payment.Status);
            Assert.Equal(0, payment.RefundedAmount); Assert.Equal(approved, payment.ApprovedAt);
            Assert.Empty(await db.PaymentRefunds.ToListAsync());
        }
        finally { File.Delete(path); }
    }

    private static async Task SeedFinancialPayment(string path)
    {
        await using var db = CreateContext(path);
        await db.Database.MigrateAsync();
        var order = new Order(0, "pickup", "Cliente", "11999990000", "cliente@teste.com", "52998224725");
        order.AddItem(new OrderItem(1, 1, 100));
        db.Add(order); await db.SaveChangesAsync();
        var payment = new Payment(order.Id, 100, Guid.NewGuid().ToString(), PaymentMethod.Pix);
        payment.Approve(); db.Add(payment); await db.SaveChangesAsync();
    }

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
