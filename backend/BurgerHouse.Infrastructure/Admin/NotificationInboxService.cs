using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed class NotificationInboxService(BurgerHouseDbContext db, TimeProvider clock) : INotificationInboxService
{
    private const int PageSize = 50;

    public async Task<NotificationInbox> ListAsync(int ownerId, int? beforeId, CancellationToken ct)
    {
        if (beforeId <= 0) throw new ArgumentException("Invalid cursor.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var state = db.Set<OwnerNotificationState>().Where(x => x.OwnerId == ownerId);
        var feed = db.Payments.AsNoTracking().Where(p => p.ApprovedAt != null)
            .GroupBy(p => p.OrderId).Select(group => new { OrderId = group.Key, ApprovedAt = group.Min(p => p.ApprovedAt) });
        var unreadCount = await feed.CountAsync(p => !state.Any(x => x.OrderId == p.OrderId), ct);
        var available = feed.Where(p => !state.Any(x => x.OrderId == p.OrderId && x.Archived));
        if (beforeId.HasValue) available = available.Where(p => p.OrderId < beforeId);
        var items = await (from approval in available
            join order in db.Orders.AsNoTracking() on approval.OrderId equals order.Id
            orderby approval.OrderId descending
            select new InboxItem(order.Id, approval.ApprovedAt!.Value, state.Any(x => x.OrderId == order.Id),
                order.OrderType, order.CustomerName, db.Payments.Where(payment => payment.OrderId == order.Id && payment.ApprovedAt == approval.ApprovedAt)
                    .OrderBy(payment => payment.Id).Select(payment => (decimal?)payment.Amount).FirstOrDefault()))
            .Take(PageSize + 1)
            .ToListAsync(ct);
        await transaction.CommitAsync(ct);
        return new(items.Take(PageSize).Select(item => item with { ApprovedAt = DateTime.SpecifyKind(item.ApprovedAt, DateTimeKind.Utc) }).ToList(), items.Count > PageSize ? items[PageSize - 1].Id : null, unreadCount);
    }

    public async Task UpdateAsync(int ownerId, int? orderId, bool archived, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (orderId.HasValue && !await db.Payments.AnyAsync(p => p.OrderId == orderId && p.ApprovedAt != null, ct))
            throw new KeyNotFoundException();
        var changes = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "OwnerNotificationStates" ("OwnerId", "OrderId", "Archived")
            SELECT DISTINCT {ownerId}, "OrderId", {archived} FROM "Payments"
            WHERE "ApprovedAt" IS NOT NULL AND ({!orderId.HasValue} OR "OrderId" = {orderId.GetValueOrDefault()})
            ON CONFLICT ("OwnerId", "OrderId") DO UPDATE SET "Archived" = excluded."Archived"
            WHERE excluded."Archived" AND NOT "OwnerNotificationStates"."Archived"
            """, ct);
        if (changes > 0)
        {
            var action = archived ? "NotificationArchived" : "NotificationRead";
            db.AdminAuditLogs.Add(new AdminAuditLog(ownerId, "Admin", action, "Notification",
                orderId?.ToString() ?? "inbox", System.Text.Json.JsonSerializer.Serialize(new { changes }),
                clock.GetUtcNow().UtcDateTime));
            await db.SaveChangesAsync(ct);
        }
        await transaction.CommitAsync(ct);
    }
}
