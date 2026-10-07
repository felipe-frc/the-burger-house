using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed class AdminService(BurgerHouseDbContext db) : IAdminService
{
    private IQueryable<Payment> Period(DateRange range) => db.Payments.AsNoTracking()
        .Where(p => (p.UpdatedAt ?? p.CreatedAt) >= range.Start && (p.UpdatedAt ?? p.CreatedAt) < range.End);
    private IQueryable<Payment> Approved(DateRange range) => Period(range).Where(p => p.Status == PaymentStatus.Approved);

    public async Task<FinanceSummary> SummaryAsync(DateRange range, CancellationToken ct)
    {
        var payments = Approved(range);
        var revenue = await payments.SumAsync(p => p.Amount, ct);
        var count = await payments.CountAsync(ct);
        var completeOrders = db.Orders.Where(o => payments.Any(p => p.OrderId == o.Id)
            && o.Items.Any() && o.Items.All(i => i.UnitCost != null));
        var covered = await completeOrders.CountAsync(ct);
        var profit = await completeOrders.SelectMany(o => o.Items)
            .SumAsync(i => (i.UnitPrice - i.UnitCost!.Value) * i.Quantity, ct);
        var partial = await Period(range).CountAsync(p => p.Status == PaymentStatus.PartiallyRefunded, ct);
        return new(revenue, count, count == 0 ? 0 : decimal.Round(revenue / count, 2),
            covered == 0 ? null : profit, covered, partial);
    }
    public async Task<IReadOnlyList<RevenuePoint>> RevenueAsync(DateRange range, CancellationToken ct)
    {
        // Current shop dates use São Paulo (UTC-3); group in SQL, return at most 367 days.
        var rows = await Approved(range).GroupBy(p => (p.UpdatedAt ?? p.CreatedAt).AddHours(-3).Date)
            .Select(g => new { Date = g.Key, Revenue = g.Sum(p => p.Amount) }).ToListAsync(ct);
        var values = rows.ToDictionary(r => r.Date, r => r.Revenue);
        var result = new List<RevenuePoint>();
        for (var date = DateRange.LocalToday(range.Start); date < DateRange.LocalToday(range.End); date = date.AddDays(1))
            result.Add(new(date.ToString("yyyy-MM-dd"), values.GetValueOrDefault(date)));
        return result;
    }
    public async Task<IReadOnlyList<MethodSummary>> MethodsAsync(DateRange range, CancellationToken ct)
    {
        var rows = await Approved(range).GroupBy(p => p.Method)
            .Select(g => new { Method = g.Key, Count = g.Count(), Revenue = g.Sum(p => p.Amount) }).ToListAsync(ct);
        var total = rows.Sum(r => r.Revenue);
        return rows.Select(r => new MethodSummary(r.Method.ToString(), r.Count, r.Revenue,
            total == 0 ? 0 : decimal.Round(r.Revenue * 100 / total, 2))).ToList();
    }
    public async Task<Page<TransactionRow>> TransactionsAsync(DateRange range, int page, CancellationToken ct)
    {
        ValidatePage(page);
        var query = Period(range);
        var total = await query.CountAsync(ct);
        var rows = await (from p in query join o in db.Orders on p.OrderId equals o.Id
            orderby (p.UpdatedAt ?? p.CreatedAt) descending, p.Id descending
            select new { p.OrderId, o.CustomerName, Date = p.UpdatedAt ?? p.CreatedAt, p.Method, p.Amount, p.Status })
            .Skip((page - 1) * 20).Take(20).ToListAsync(ct);
        return new(rows.Select(r => new TransactionRow(r.OrderId, r.CustomerName, r.Date,
            r.Method.ToString(), r.Amount, r.Status.ToString())).ToList(), total, page);
    }
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
        return new(day, week, month, last30, open, received, recent);
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
    public async Task<Page<OrderRow>> OrdersAsync(OrderFilter filter, CancellationToken ct)
    {
        ValidatePage(filter.Page);
        var query = db.Orders.AsNoTracking();
        if (!string.IsNullOrEmpty(filter.Status))
        {
            if (!Enum.TryParse<OrderStatus>(filter.Status, out var status) || !Enum.IsDefined(status))
                throw new ArgumentException("Invalid status.");
            query = query.Where(o => o.Status == status);
        }
        var search = filter.Search?.Trim();
        if (search?.Length > 120) throw new ArgumentException("Search too long.");
        if (!string.IsNullOrEmpty(search))
        {
            var id = int.TryParse(search.TrimStart('#'), out var parsed) ? parsed : 0;
            query = query.Where(o => o.Id == id || o.CustomerName.ToLower().Contains(search.ToLower()));
        }
        if (filter.Sort is not ("newest" or "oldest")) throw new ArgumentException("Invalid sort.");
        var total = await query.CountAsync(ct);
        var sorted = filter.Sort == "oldest" ? query.OrderBy(o => o.CreatedAt).ThenBy(o => o.Id)
            : query.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id);
        return new(await Rows(sorted.Skip((filter.Page - 1) * 20).Take(20), ct), total, filter.Page);
    }
    private async Task<IReadOnlyList<OrderRow>> Rows(IQueryable<Order> query, CancellationToken ct)
    {
        var rows = await query.Select(o => new
        {
            o.Id, o.CreatedAt, o.CustomerName, o.OrderType, ItemCount = o.Items.Sum(i => i.Quantity),
            Total = o.Items.Sum(i => i.UnitPrice * i.Quantity) + o.DeliveryFee, o.Status,
            PaymentMethod = db.Payments.Where(p => p.OrderId == o.Id).OrderByDescending(p => p.Id).Select(p => (PaymentMethod?)p.Method).FirstOrDefault(),
            PaymentStatus = db.Payments.Where(p => p.OrderId == o.Id).OrderByDescending(p => p.Id).Select(p => (PaymentStatus?)p.Status).FirstOrDefault()
        }).ToListAsync(ct);
        return rows.Select(r => new OrderRow(r.Id, r.CreatedAt, r.CustomerName, r.OrderType, r.ItemCount, r.Total,
            r.Status.ToString(), r.PaymentMethod?.ToString(), r.PaymentStatus?.ToString())).ToList();
    }
    public async Task<OrderDetail?> OrderAsync(int id, CancellationToken ct)
    {
        var o = await db.Orders.AsNoTracking().SingleOrDefaultAsync(o => o.Id == id, ct);
        if (o is null) return null;
        var row = (await Rows(db.Orders.Where(o => o.Id == id), ct)).Single();
        var items = await (from item in db.OrderItems
            where EF.Property<int>(item, "OrderId") == id
            join product in db.Products on item.ProductId equals product.Id
            select new ItemDetail(product.Name, item.Quantity, item.UnitPrice, item.UnitPrice * item.Quantity, item.Observation)).ToListAsync(ct);
        var payments = await db.Payments.AsNoTracking().Where(p => p.OrderId == id).OrderByDescending(p => p.Id)
            .Select(p => new PaymentDetail(p.Status.ToString(), p.Method.ToString(), p.Amount, p.UpdatedAt ?? p.CreatedAt)).ToListAsync(ct);
        return new(row, o.CustomerPhone, o.ZipCode, o.Street, o.HouseNumber, o.Neighborhood, o.City,
            o.Complement, o.Observation, o.DeliveryFee, items, payments);
    }
    public async Task AdvanceAsync(int id, OrderStatus expected, OrderStatus next, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var order = await db.Orders.SingleOrDefaultAsync(o => o.Id == id, ct) ?? throw new KeyNotFoundException();
        if (order.Status != expected) throw new InvalidOperationException("Order changed.");
        if (!await db.Payments.AnyAsync(p => p.OrderId == id && p.Status == PaymentStatus.Approved, ct))
            throw new InvalidOperationException("Payment is not approved.");
        order.AdvanceStatus(next);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new InvalidOperationException("Order changed."); }
        await transaction.CommitAsync(ct);
    }
    public async Task<IReadOnlyList<ProductRow>> ProductsAsync(CancellationToken ct) =>
        await db.Products.AsNoTracking().OrderBy(p => p.Id).Select(p => new ProductRow(p.Id, p.Name, p.Price, p.CostPrice, p.IsActive)).ToListAsync(ct);
    public async Task UpdateProductAsync(int id, decimal price, decimal? cost, bool active, CancellationToken ct)
    {
        if (price <= 0 || price > 99999999.99m || decimal.Round(price, 2) != price) throw new ArgumentException("Invalid price.");
        var product = await db.Products.SingleOrDefaultAsync(p => p.Id == id, ct) ?? throw new KeyNotFoundException();
        product.UpdateCost(cost);
        product.UpdatePrice(price);
        if (active) product.Activate(); else product.Deactivate();
        await db.SaveChangesAsync(ct);
    }
    private static void ValidatePage(int page)
    {
        if (page < 1 || page > 100000) throw new ArgumentException("Invalid page.");
    }
}
