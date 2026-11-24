using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed partial class AdminService
{
    private IQueryable<Payment> PaymentsByChannel(DateRange range)
    {
        var payments = db.Payments.AsNoTracking();
        return range.Channel is null ? payments : payments.Where(payment =>
            db.Orders.Any(order => order.Id == payment.OrderId && order.OrderType == range.Channel));
    }
    private IQueryable<Payment> Period(DateRange range) => PaymentsByChannel(range)
        .Where(p => (p.UpdatedAt ?? p.CreatedAt) >= range.Start && (p.UpdatedAt ?? p.CreatedAt) < range.End);
    private IQueryable<Payment> Approved(DateRange range) => PaymentsByChannel(range)
        .Where(p => p.ApprovedAt >= range.Start && p.ApprovedAt < range.End);

    public async Task<OrderMovementReport> OrderMovementAsync(DateOnly start, DateOnly end, DateTime utcNow,
        string? channel, CancellationToken ct)
    {
        var range = DateRange.FromDates(start.ToDateTime(TimeOnly.MinValue), end.ToDateTime(TimeOnly.MinValue));
        var cutoff = range.End < utcNow ? range.End : utcNow;
        var orders = db.Orders.AsNoTracking().Where(o => o.CreatedAt >= range.Start && o.CreatedAt < cutoff &&
            o.Status != OrderStatus.Cancelled);
        if (channel is not null) orders = orders.Where(o => o.OrderType == channel);
        // SQLite groups by UTC hour. Converting each bucket preserves São Paulo's historical offsets.
        var rows = await orders.GroupBy(o => new { Date = o.CreatedAt.Date, Hour = o.CreatedAt.Hour })
            .Select(g => new { g.Key.Date, g.Key.Hour, Count = g.Count() }).ToListAsync(ct);
        var hours = rows.Select(row =>
            {
                var local = TimeZoneInfo.ConvertTimeFromUtc(row.Date.AddHours(row.Hour), DateRange.Zone);
                return new OrderMovementHour(DateOnly.FromDateTime(local), local.Hour, row.Count);
            })
            .GroupBy(row => new { row.Date, row.Hour })
            .Select(g => new OrderMovementHour(g.Key.Date, g.Key.Hour, g.Sum(row => row.Count)))
            .OrderBy(row => row.Date).ThenBy(row => row.Hour).ToArray();
        var settings = await OperationSettingsAsync(ct);
        return new(start, end, DateOnly.FromDateTime(DateRange.LocalToday(utcNow)), hours, settings.Limits.Schedule);
    }

    private IQueryable<PaymentRefund> ScopedRefunds(DateRange range)
    {
        var refunds = db.PaymentRefunds.AsNoTracking();
        if (range.Channel is null) return refunds;
        var payments = PaymentsByChannel(range);
        return refunds.Where(refund => payments.Any(p => p.Id == refund.PaymentId));
    }

    private static IQueryable<PaymentRefund> DatedRefunds(IQueryable<PaymentRefund> refunds, DateRange range) =>
        refunds.Where(r => r.CreatedAt >= range.Start && r.CreatedAt < range.End);

    public async Task<FinanceSummary> SummaryAsync(DateRange range, CancellationToken ct)
    {
        var payments = Approved(range);
        var revenue = await payments.SumAsync(p => p.Amount, ct);
        var count = await payments.Select(payment => payment.OrderId).Distinct().CountAsync(ct);
        var completeOrders = db.Orders.Where(o => payments.Any(p => p.OrderId == o.Id)
            && o.Items.Any() && o.Items.All(i => i.UnitCost != null));
        var covered = await completeOrders.CountAsync(ct);
        var profit = await completeOrders.SelectMany(o => o.Items)
            .SumAsync(i => (i.UnitPrice - i.UnitCost!.Value) * i.Quantity, ct);
        var scopedPayments = PaymentsByChannel(range);
        var scopedRefunds = ScopedRefunds(range);
        var refundEvents = DatedRefunds(scopedRefunds, range);
        var refunded = await refundEvents.SumAsync(r => r.Amount, ct);
        var partial = await (from r in refundEvents join p in db.Payments on r.PaymentId equals p.Id
            where r.CumulativeRefundedAmount < p.Amount select p.Id).Distinct().CountAsync(ct);
        var estimated = await payments.CountAsync(p => p.ApprovalDateSource == ApprovalDateSource.LegacyEstimate, ct);
        // These quality indicators describe the entire history, not dated period totals.
        var unknown = await scopedPayments.CountAsync(p => p.ApprovedAt == null &&
            (p.Status == PaymentStatus.Approved || p.Status == PaymentStatus.PartiallyRefunded ||
             p.Status == PaymentStatus.Refunded || p.Status == PaymentStatus.ChargedBack), ct);
        var unreconstructed = await scopedPayments.CountAsync(p => p.RefundTrackingStartedAt == null, ct);
        var openingBalance = await scopedPayments.SumAsync(p => p.RefundedAmount, ct) -
            await scopedRefunds.SumAsync(r => r.Amount, ct);
        return new(revenue, refunded, revenue - refunded, count, count == 0 ? 0 : decimal.Round(revenue / count, 2),
            covered == 0 ? null : profit, covered, partial, estimated, unknown, unreconstructed, openingBalance);
    }
    public async Task<IReadOnlyList<RevenuePoint>> RevenueAsync(DateRange range, CancellationToken ct)
    {
        // Current shop dates use São Paulo (UTC-3); group in SQL, return at most 367 days.
        var rows = await Approved(range).GroupBy(p => p.ApprovedAt!.Value.AddHours(-3).Date)
            .Select(g => new { Date = g.Key, Revenue = g.Sum(p => p.Amount) }).ToListAsync(ct);
        var values = rows.ToDictionary(r => r.Date, r => r.Revenue);
        var result = new List<RevenuePoint>();
        for (var date = DateRange.LocalToday(range.Start); date <= DateRange.LocalToday(range.End.AddTicks(-1)); date = date.AddDays(1))
            result.Add(new(date.ToString("yyyy-MM-dd"), values.GetValueOrDefault(date)));
        return result;
    }
    public async Task<IReadOnlyList<RevenuePoint>> HourlyRevenueAsync(DateRange range, CancellationToken ct)
    {
        if (range.End - range.Start > TimeSpan.FromDays(1))
            throw new ArgumentException("Hourly revenue requires a period of at most one day.");

        var offset = DateRange.Zone.GetUtcOffset(range.Start).TotalHours;
        var rows = await Approved(range).GroupBy(payment => new
            { Date = payment.ApprovedAt!.Value.AddHours(offset).Date, Hour = payment.ApprovedAt.Value.AddHours(offset).Hour })
            .Select(group => new { group.Key, Revenue = group.Sum(payment => payment.Amount) }).ToListAsync(ct);
        var values = rows.ToDictionary(row => (row.Key.Date, row.Key.Hour), row => row.Revenue);
        var localStart = range.Start.AddHours(offset);
        var points = new List<RevenuePoint>();
        for (var hour = localStart.Date.AddHours(localStart.Hour); hour < range.End.AddHours(offset); hour = hour.AddHours(1))
            points.Add(new($"{hour:yyyy-MM-dd'T'HH}:00", values.GetValueOrDefault((hour.Date, hour.Hour))));
        return points;
    }
    public async Task<IReadOnlyList<MethodSummary>> MethodsAsync(DateRange range, CancellationToken ct)
    {
        var rows = await Approved(range).GroupBy(p => p.Method)
            .Select(g => new { Method = g.Key, Count = g.Count(), Revenue = g.Sum(p => p.Amount) }).ToListAsync(ct);
        var total = rows.Sum(r => r.Revenue);
        return rows.Select(r => new MethodSummary(r.Method.ToString(), r.Count, r.Revenue,
            total == 0 ? 0 : decimal.Round(r.Revenue * 100 / total, 2))).ToList();
    }
    private enum RevenuePart { Product, Freight, Approved, Refund }

    public async Task<CategoryRevenueReport> CategoryRevenueAsync(DateRange range, CancellationToken ct)
    {
        var approved = Approved(range);
        var singleApproval = db.Payments
            .Where(p => p.ApprovedAt != null || p.Status == PaymentStatus.Approved ||
                p.Status == PaymentStatus.PartiallyRefunded || p.Status == PaymentStatus.Refunded ||
                p.Status == PaymentStatus.ChargedBack)
            .GroupBy(p => p.OrderId)
            .Where(g => g.Count() == 1)
            .Select(g => g.Key);

        // Allocate a charge only when it uniquely funds the order at recorded item prices.
        // Differences and multiple captures cannot be attributed to individual items.
        var matchedOrders =
            from payment in approved
            join order in db.Orders.AsNoTracking() on payment.OrderId equals order.Id
            where singleApproval.Contains(order.Id) && order.Items.Any() &&
                payment.Amount == order.DeliveryFee + order.Items.Sum(item => item.UnitPrice * item.Quantity) - order.Discount
            select order;

        // One read statement keeps all components on the same database snapshot.
        var products = from order in matchedOrders
                       from item in order.Items
                       select new { Part = RevenuePart.Product, Category = item.SaleCategory ?? "", Amount = item.UnitPrice * item.Quantity - item.DiscountAmount };
        var buckets = await products
            .Concat(matchedOrders.Select(o => new { Part = RevenuePart.Freight, Category = "", Amount = o.DeliveryFee }))
            .Concat(approved.Select(p => new { Part = RevenuePart.Approved, Category = "", p.Amount }))
            .Concat(DatedRefunds(ScopedRefunds(range), range).Select(r => new { Part = RevenuePart.Refund, Category = "", r.Amount }))
            .GroupBy(row => new { row.Part, row.Category })
            .Select(g => new { g.Key.Part, g.Key.Category, Revenue = g.Sum(row => row.Amount) })
            .ToListAsync(ct);
        var itemRevenue = buckets.Where(row => row.Part == RevenuePart.Product);
        var categories = itemRevenue.Where(row => Product.IsValidCategory(row.Category))
            .Select(row => new CategoryRevenueRow(row.Category, row.Revenue)).ToArray();
        var unclassified = itemRevenue.Where(row => !Product.IsValidCategory(row.Category)).Sum(row => row.Revenue);
        var delivery = buckets.SingleOrDefault(row => row.Part == RevenuePart.Freight)?.Revenue ?? 0m;
        var gross = buckets.SingleOrDefault(row => row.Part == RevenuePart.Approved)?.Revenue ?? 0m;
        var refunds = buckets.SingleOrDefault(row => row.Part == RevenuePart.Refund)?.Revenue ?? 0m;
        return new(categories, unclassified, delivery, gross - delivery - unclassified - categories.Sum(row => row.Revenue), gross, refunds);
    }

    public async Task<Page<TransactionRow>> TransactionsAsync(DateRange range, int page, CancellationToken ct)
    {
        ValidatePage(page);
        var query = Period(range);
        var total = await query.CountAsync(ct);
        var rows = await (from p in query join o in db.Orders on p.OrderId equals o.Id
            orderby (p.UpdatedAt ?? p.CreatedAt) descending, p.Id descending
            select new { p.OrderId, o.CustomerName, Date = p.UpdatedAt ?? p.CreatedAt, p.Method, p.Amount, p.Status,
                p.ApprovedAt, p.ApprovalDateSource, p.RefundedAmount })
            .Skip((page - 1) * 20).Take(20).ToListAsync(ct);
        return new(rows.Select(r => new TransactionRow(r.OrderId, r.CustomerName, r.Date,
            r.Method.ToString(), r.Amount, r.Status.ToString(), r.ApprovedAt,
            r.ApprovalDateSource.ToString(), r.RefundedAmount)).ToList(), total, page);
    }
    public async Task<IReadOnlyList<AuditLogRow>> AuditLogsAsync(
        DateRange range,
        CancellationToken ct)
    {
        var rows =
            await db.AdminAuditLogs
                .AsNoTracking()
                .Where(log =>
                    log.CreatedAtUtc >= range.Start &&
                    log.CreatedAtUtc < range.End
                )
                .OrderByDescending(log =>
                    log.CreatedAtUtc
                )
                .ThenByDescending(log =>
                    log.Id
                )
                .Take(50)
                .Select(log =>
                    new
                    {
                        log.CreatedAtUtc,
                        log.AdminUserId,
                        log.ActorType,
                        log.Action,
                        log.EntityType,
                        log.EntityId,
                        log.Changes
                    }
                )
                .ToListAsync(ct);

        return rows
            .Select(row =>
                new AuditLogRow(
                    row.CreatedAtUtc,
                    row.ActorType switch
                    {
                        "Admin" when row.AdminUserId.HasValue =>
                            $"Administrador #{row.AdminUserId.Value}",

                        "Provider" =>
                            "PagBank",

                        "System" =>
                            "Sistema",

                        _ =>
                            row.ActorType
                    },
                    row.Action,
                    row.EntityType,
                    row.EntityId,
                    row.Changes
                )
            )
            .ToList();
    }
}
