using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class AdminAgendaServiceTests : IAsyncLifetime
{
    private readonly string path = Path.Combine(Path.GetTempPath(), "agenda-test-" + Guid.NewGuid() + ".db");
    private DbContextOptions<BurgerHouseDbContext> Options => new DbContextOptionsBuilder<BurgerHouseDbContext>()
        .UseSqlite($"Data Source={path};Pooling=False").Options;
    private string? postgres;
    private BurgerHouseDbContext Open() => postgres == null ? new BurgerHouseDbContext(Options, TestPersonalData.Protector) : PostgresLab.Open(postgres);
    private static AgendaDraft Draft => new("Reunião sintética", "", "2026-11-16", "09:00", "10:00", "Operação", "pending", "");

    public async Task InitializeAsync()
    {
        postgres = PostgresLab.Create();
        await using var db = Open();
        await db.Database.MigrateAsync();
        db.Add(new AdminUser("owner@example.invalid", "fixture-hash"));
        await db.SaveChangesAsync();
    }
    public Task DisposeAsync()
    {
        File.Delete(path);
        File.Delete(path + "-wal");
        File.Delete(path + "-shm");
        return Task.CompletedTask;
    }

    [Fact]
    public async Task CreateAndUpdateSurviveNewContextAndRejectStaleRevision()
    {
        await using (var db = Open())
            await new AdminAgendaService(db).CreateAsync("stable-id", Draft, 1, DateTime.UtcNow, default);
        await using (var db = Open())
        {
            var service = new AdminAgendaService(db);
            var row = Assert.Single(await service.ListAsync("2026-11-01", "2026-11-30", default));
            Assert.Equal(1, row.Revision);
            await service.UpdateAsync(row.Id, row.Revision, Draft with { Status = "completed" }, 1, DateTime.UtcNow, default);
        }
        await using (var db = Open())
        {
            var service = new AdminAgendaService(db);
            Assert.Equal("completed", Assert.Single(await service.ListAsync("2026-11-16", "2026-11-16", default)).Status);
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdateAsync("stable-id", 1, Draft, 1, DateTime.UtcNow, default));
            Assert.Equal(2, await db.AdminAuditLogs.CountAsync());
        }
    }

    [Fact]
    public async Task ImportRetryDoesNotDuplicateOrOverwriteAndDeletePreventsResurrection()
    {
        await using var db = Open();
        var service = new AdminAgendaService(db);
        var row = await service.CreateAsync("import-id", Draft, 1, DateTime.UtcNow, default);
        Assert.Equal(row, await service.CreateAsync("import-id", Draft, 1, DateTime.UtcNow, default));
        Assert.Equal(1, await db.AdminAuditLogs.CountAsync());
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync("import-id", Draft with { Title = "Different" }, 1, DateTime.UtcNow, default));
        await service.DeleteAsync(row.Id, row.Revision, 1, DateTime.UtcNow, default);
        Assert.Empty(await service.ListAsync("2026-11-01", "2026-11-30", default));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync("import-id", Draft, 1, DateTime.UtcNow, default));
    }

    [Fact]
    public async Task RangeIsValidatedBeforeReading()
    {
        await using var db = Open();
        var service = new AdminAgendaService(db);
        await Assert.ThrowsAsync<ArgumentException>(() => service.ListAsync("2026-02-30", "2026-03-01", default));
        await Assert.ThrowsAsync<ArgumentException>(() => service.ListAsync("2026-11-17", "2026-11-16", default));
        await Assert.ThrowsAsync<ArgumentException>(() => service.ListAsync("2020-01-01", "2026-11-16", default));
    }
}
