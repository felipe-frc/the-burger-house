using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class OwnerTeamAndTrackingTests
{
    [Fact]
    public async Task NightShiftAndCorrectionsPersistWithSeparatePayRecords()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(connection).Options;
        var pg = PostgresLab.Create();
        BurgerHouseDbContext Open() => pg == null ? new BurgerHouseDbContext(options, TestPersonalData.Protector) : PostgresLab.Open(pg);
        await using var db = Open();
        await db.Database.MigrateAsync();
        var owner = new AdminUser("owner.test@example.invalid", "fixture-hash");
        var member = new TeamMember("Pessoa Teste", "team.test@example.invalid", "Entregador", "Logística", "21:00 - 04:00");
        db.AddRange(owner, member);
        await db.SaveChangesAsync();
        var service = new TeamOperationsService(db);
        var now = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);
        var day = new DateOnly(2026, 11, 15);
        var month = new DateOnly(2026, 11, 1);
        var shift = new TeamWorkDayWrite(new TimeOnly(21, 0), new TimeOnly(4, 0), 30, 0);
        var schedule = await service.ScheduleAsync(member.Id, day, shift, owner.Id, now, default);
        Assert.Equal(390, schedule.PlannedMinutes);
        await service.ScheduleAsync(member.Id, day.AddDays(-1), shift, owner.Id, now, default);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ScheduleAsync(member.Id, day, shift, owner.Id, now, default));

        TeamJournalWrite Punch(string kind, DateTime value, Guid? replaces = null, string? note = null) =>
            new(Guid.NewGuid(), kind, day, value, note, replaces, null, null, null, null);

        var start = Punch("In", new(2026, 11, 15, 21, 10, 0));
        var invalid = Punch("Out", new(2026, 11, 16, 4, 30, 0));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.AppendAsync(member.Id, invalid, owner.Id, now, default));
        await service.AppendAsync(member.Id, start, owner.Id, now, default);
        await service.AppendAsync(member.Id, start, owner.Id, now, default);
        await service.AppendAsync(member.Id, Punch("BreakStart", new(2026, 11, 16, 0, 0, 0)), owner.Id, now, default);
        await service.AppendAsync(member.Id, Punch("BreakEnd", new(2026, 11, 16, 0, 30, 0)), owner.Id, now, default);
        await service.AppendAsync(member.Id, invalid, owner.Id, now, default);
        var correction = Punch("In", new(2026, 11, 15, 21, 5, 0), start.RequestId, "Ajuste sintético");
        await service.AppendAsync(member.Id, correction, owner.Id, now, default);
        await service.AppendAsync(member.Id, new(Guid.NewGuid(), "PayPolicy", month, null, null, null, 2500m, 60m, "Monthly", null), owner.Id, now, default);
        await service.AppendAsync(member.Id, new(Guid.NewGuid(), "Payment", month, null, null, null, 100m, null, "Planned", null), owner.Id, now, default);
        await service.AppendAsync(member.Id, new(Guid.NewGuid(), "Payment", month, null, null, null, 80m, null, "Paid", "Pagamento sintético"), owner.Id, now, default);
        await service.AppendAsync(member.Id, new(Guid.NewGuid(), "Payment", month, null, "Ajuste sintético", null, -20m, null, "Adjustment", null), owner.Id, now, default);
        await service.AppendAsync(member.Id, new(Guid.NewGuid(), "Recognition", day, null, "Registro sintético", null, null, null, null, null), owner.Id, now, default);

        await using var restored = Open();
        var summary = await new TeamOperationsService(restored).MonthAsync(member.Id, month, now, default);
        var worked = Assert.Single(summary.Days, row => row.State == "Worked");
        Assert.Equal(415, worked.WorkedMinutes);
        Assert.Equal(25, worked.ExtraMinutes);
        Assert.Equal(5, worked.LateMinutes);
        Assert.Equal(25m, summary.ExtraAmount);
        Assert.Equal(1, summary.Absences);
        Assert.Single(summary.Entries, entry => entry.Id == start.RequestId);
        Assert.Single(summary.Entries, entry => entry.ReplacesId == start.RequestId);
        Assert.Equal(3, summary.Entries.Count(entry => entry.Kind == "Payment"));
        Assert.Equal(-20m, Assert.Single(summary.Entries, entry => entry.Status == "Adjustment").Amount);
        Assert.Single(summary.Entries, entry => entry.Kind == "Recognition");
        Assert.Equal(0, await restored.Payments.CountAsync());
        Assert.Equal(12, await restored.AdminAuditLogs.CountAsync());
    }

    [Fact]
    public async Task CourierCredentialIsScopedThrottledAndRevokedOnCompletion()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(connection).Options;
        var pg = PostgresLab.Create();
        BurgerHouseDbContext Open() => pg == null ? new BurgerHouseDbContext(options, TestPersonalData.Protector) : PostgresLab.Open(pg);
        await using var db = Open();
        await db.Database.MigrateAsync();
        var owner = new AdminUser("owner.test@example.invalid", "fixture-hash");
        var member = new TeamMember("Entregador Teste", "courier.test@example.invalid", "Entregador", "Logística", "18:00 - 23:00");
        var clerk = new TeamMember("Atendente Teste", "clerk.test@example.invalid", "Atendente", "Atendimento", "18:00 - 23:00");
        var product = new Product("fixture", "Produto Teste", 30);
        db.AddRange(owner, member, clerk, product);
        await db.SaveChangesAsync();
        Order Delivery()
        {
            var order = new Order(5, "delivery", "Cliente Teste", "11999990000", "client.test@example.invalid", "52998224725",
                "38400-000", "Rua Teste", "10", "Centro", "Cidade");
            order.AddItem(new OrderItem(product.Id, 1, 30m));
            order.MarkAsReceived();
            order.AdvanceStatus(OrderStatus.Preparing);
            order.AdvanceStatus(OrderStatus.ReadyForPickup);
            order.AdvanceStatus(OrderStatus.OutForDelivery);
            return order;
        }
        var order = Delivery();
        var other = Delivery();
        db.AddRange(order, other);
        await db.SaveChangesAsync();
        var service = new DeliveryTrackingService(db);
        var now = new DateTime(2026, 11, 17, 20, 0, 0, DateTimeKind.Utc);
        Assert.Single(await service.CouriersAsync(default));
        await Assert.ThrowsAsync<ArgumentException>(() => service.GrantAsync(order.Id, clerk.Id, owner.Id, now, default));
        var grant = await service.GrantAsync(order.Id, member.Id, owner.Id, now, default);
        Assert.Null(await service.StartAsync(other.Id, grant.Token, now, default));
        Assert.NotEqual(grant.Token, (await db.Set<DeliveryTracking>().SingleAsync()).TokenHash);
        var run = Assert.IsType<Guid>(await service.StartAsync(order.Id, grant.Token, now, default));
        var point = new CourierPositionWrite(-26.99, -48.63, 10, now, run);
        Assert.Equal(CourierTrackingResult.Accepted, await service.ReportAsync(order.Id, grant.Token, point, now, default));
        Assert.Equal(CourierTrackingResult.TooFast, await service.ReportAsync(order.Id, grant.Token, point, now.AddSeconds(1), default));
        Assert.Equal("Active", (await service.StatusAsync(order.Id, now, default)).State);
        Assert.Equal("Stale", (await service.StatusAsync(order.Id, now.AddSeconds(91), default)).State);
        Assert.Null((await service.StatusAsync(order.Id, now.AddMinutes(11), default)).Latitude);
        Assert.Equal(CourierTrackingResult.Accepted, await service.ReportAsync(order.Id, grant.Token, null, now.AddSeconds(10), default));
        Assert.Equal(CourierTrackingResult.Ended, await service.ReportAsync(order.Id, grant.Token, point, now.AddSeconds(11), default));
        order.AdvanceStatus(OrderStatus.Completed);
        await db.SaveChangesAsync();
        Assert.Null(await service.StartAsync(order.Id, grant.Token, now.AddSeconds(15), default));
        await service.PurgeAsync(now.AddSeconds(15), default);
        Assert.Empty(await db.Set<DeliveryTracking>().AsNoTracking().ToListAsync());
        Assert.All(await db.AdminAuditLogs.ToListAsync(), entry => Assert.DoesNotContain(grant.Token, entry.Changes));
    }
}
