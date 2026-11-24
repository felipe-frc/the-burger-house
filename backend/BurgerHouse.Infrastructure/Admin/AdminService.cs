using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed partial class AdminService(BurgerHouseDbContext db) : IAdminService
{
    public async Task<Dashboard> DashboardAsync(DateTime utcNow, CancellationToken ct)
    {
        var today = DateRange.LocalToday(utcNow);
        var day = await SummaryAsync(DateRange.FromDates(today, today), ct);
        var week = await SummaryAsync(DateRange.FromDates(today.AddDays(-6), today), ct);
        var month = await SummaryAsync(DateRange.FromDates(new(today.Year, today.Month, 1), today), ct);
        var last30 = await SummaryAsync(DateRange.FromDates(today.AddDays(-29), today), ct);
        var paid = db.Orders.Where(o => db.Payments.Any(p => p.OrderId == o.Id && p.Status == PaymentStatus.Approved));
        var open = await paid.CountAsync(o => o.Status != OrderStatus.Completed && o.Status != OrderStatus.Cancelled, ct);
        var received = await paid.CountAsync(o => o.Status == OrderStatus.Received, ct);
        var recent = await Rows(paid.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id).Take(8), ct);
        var counts = await db.Orders.AsNoTracking().GroupBy(order => new { order.Status, order.OrderType })
            .Select(group => new { group.Key, Count = group.Count() }).ToListAsync(ct);
        var settings = await OperationSettingsAsync(ct);
        var range = DateRange.ForShift(utcNow, settings.Limits.Schedule);
        var shift = range is null ? null : new DashboardShift(utcNow >= range.Start && utcNow < range.End, range.Start, range.End,
            await SummaryAsync(range, ct));
        return new(day, week, month, last30, open, received, recent, counts.Select(row =>
            new OrderQueueCount(row.Key.Status.ToString(), row.Key.OrderType, row.Count)).ToList(), shift);
    }
    public async Task<NotificationBatch> NotificationsAsync(DateTime? since, DateTime until, int afterId, CancellationToken ct)
    {
        if (afterId < 0 || (since.HasValue && (since > until || until - since > TimeSpan.FromDays(1))))
            throw new ArgumentException("Invalid notification cursor.");
        var paid = db.Orders.AsNoTracking().Where(o => db.Payments.Any(p => p.OrderId == o.Id && p.Status == PaymentStatus.Approved));
        var count = await paid.CountAsync(o => o.Status == OrderStatus.Received, ct);
        if (!since.HasValue) return new(until, null, count, []);
        var query = paid.Where(o => o.Id > afterId && db.Payments.Any(p => p.OrderId == o.Id && p.Status == PaymentStatus.Approved
            && (p.UpdatedAt ?? p.CreatedAt) > since.Value && (p.UpdatedAt ?? p.CreatedAt) <= until));
        var rows = await Rows(query.OrderBy(o => o.Id).Take(51), ct);
        return new(until, rows.Count > 50 ? rows[49].Id : null, count, rows.Take(50).ToList());
    }
    public async Task<OperationSettings> OperationSettingsAsync(CancellationToken ct)
    {
        var latest = await db.AdminAuditLogs.AsNoTracking()
            .Where(log => log.EntityType == "Store" && log.EntityId == "operation" && log.Action == "OperationLimitsChanged")
            .OrderByDescending(log => log.Id).FirstOrDefaultAsync(ct);
        return latest is null ? new(0, new(0, 0, 0)) :
            new(latest.Id, JsonSerializer.Deserialize<OperationLimits>(latest.Changes)
                ?? throw new InvalidOperationException("Invalid stored operation settings."));
    }

    public async Task<IReadOnlyList<CustomerSummary>> CustomersAsync(DateTime since, string? search, CancellationToken ct)
    {
        var rows = await db.Orders.AsNoTracking()
            .Where(order => order.CreatedAt >= since && order.CustomerTaxId != null &&
                db.Payments.Any(payment => payment.OrderId == order.Id && payment.ApprovedAt != null))
            .OrderByDescending(order => order.CreatedAt).ThenByDescending(order => order.Id)
            .Select(order => new
            {
                order.Id, order.CustomerName, order.CustomerTaxId, order.CreatedAt, order.CustomerPhone,
                order.OrderType, order.Street, order.HouseNumber, order.Neighborhood, order.City,
                ApprovedAmount = db.Payments.Where(payment => payment.OrderId == order.Id && payment.ApprovedAt != null)
                    .OrderByDescending(payment => payment.Id).Select(payment => payment.Amount).First()
            }).ToListAsync(ct);

        var term = search?.Trim().TrimStart('#');
        var id = int.TryParse(term, out var orderId) ? orderId : 0;
        return rows.Where(row => row.CustomerTaxId is { Length: 11 } taxId && taxId.All(char.IsAsciiDigit))
            .GroupBy(row => row.CustomerTaxId)
            .Where(group => string.IsNullOrEmpty(term) || group.Any(row =>
                row.Id == id || row.CustomerName.Contains(term, StringComparison.OrdinalIgnoreCase)))
            .Take(100)
            .Select(group =>
            {
                var latest = group.First();
                return new CustomerSummary(latest.CustomerName,
                    group.Select(row => new CustomerPurchase(row.Id, DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc),
                        row.ApprovedAmount)).ToArray(), latest.CustomerPhone,
                    latest.OrderType == "delivery" ? string.Join(", ", new[] { latest.Street, latest.HouseNumber,
                        latest.Neighborhood, latest.City }.Where(value => !string.IsNullOrWhiteSpace(value))) : null);
            }).ToArray();
    }

    public async Task SaveOperationSettingsAsync(OperationSettings settings, int adminUserId, DateTime utcNow, CancellationToken ct)
    {
        if (settings.Limits is not { } limits || limits.Preparing is < 0 or > 1440 ||
            limits.ReadyForPickup is < 0 or > 1440 || limits.OutForDelivery is < 0 or > 1440 ||
            limits.PendingPaymentAgeHours is < 0 or > 8760 ||
            limits.Schedule is { Enabled: true } schedule && !schedule.TryGetHours(out _, out _))
            throw new ArgumentException("Invalid operation limits.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var current = await OperationSettingsAsync(ct);
        if (current.Revision != settings.Revision)
            throw new InvalidOperationException("Operation settings changed.");
        limits = limits with { Schedule = limits.Schedule ?? current.Limits.Schedule,
            PendingPaymentAgeHours = limits.PendingPaymentAgeHours ?? current.Limits.PendingPaymentAgeHours };
        if (current.Limits != limits)
        {
            db.AdminAuditLogs.Add(new AdminAuditLog(adminUserId, "Admin", "OperationLimitsChanged", "Store",
                "operation", JsonSerializer.Serialize(limits), utcNow));
            await db.SaveChangesAsync(ct);
        }
        await transaction.CommitAsync(ct);
    }

    private static void ValidatePage(int page)
    {
        if (page < 1 || page > 100000) throw new ArgumentException("Invalid page.");
    }
}
