using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class TeamServiceTests
{
    [Fact]
    public async Task TeamPersistsFiltersAndAuditsWithoutCreatingAnIdentity()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(connection).Options;
        await using var db = new BurgerHouseDbContext(options, TestPersonalData.Protector);
        await db.Database.EnsureCreatedAsync();
        db.AddRange(new AdminUser("owner1@example.invalid", "fixture-hash"), new AdminUser("owner2@example.invalid", "fixture-hash"));
        await db.SaveChangesAsync();
        var service = new TeamService(db);
        var draft = new TeamWrite("Maria Teste", "synthetic@example.invalid", "Atendente", "Atendimento", "18:00 - 23:00");
        var created = await service.CreateAsync(draft, 1, DateTime.UtcNow, default);
        Assert.Equal(1, created.Revision);
        Assert.Equal(2, await db.Set<AdminUser>().CountAsync());
        await using var second = new BurgerHouseDbContext(options, TestPersonalData.Protector);
        var other = new TeamService(second);
        var updated = await other.UpdateAsync(created.Id, draft with { Revision = 1, Active = false }, 2, DateTime.UtcNow, default);
        Assert.False(updated.Active);
        Assert.Equal(2, updated.Revision);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdateAsync(created.Id,
            draft with { Revision = 1, Name = "Outra Pessoa" }, 1, DateTime.UtcNow, default));
        await using var fresh = new BurgerHouseDbContext(options, TestPersonalData.Protector);
        var reader = new TeamService(fresh);
        var found = await reader.ListAsync("MARIA", false, 1, default);
        Assert.Single(found.Items);
        Assert.Equal("Maria Teste", found.Items[0].Name);
        Assert.Empty((await reader.ListAsync(null, true, 1, default)).Items);
        var logs = await fresh.AdminAuditLogs.ToListAsync();
        Assert.Equal(2, logs.Count);
        Assert.All(logs, log => Assert.DoesNotContain("synthetic@example.invalid", log.Changes));
        Assert.All(logs, log => Assert.DoesNotContain("Maria", log.Changes));
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT Name, Email FROM TeamMembers";
        await using var row = await command.ExecuteReaderAsync();
        Assert.True(await row.ReadAsync());
        Assert.NotEqual("Maria Teste", row.GetString(0));
        Assert.NotEqual("synthetic@example.invalid", row.GetString(1));
    }
}
