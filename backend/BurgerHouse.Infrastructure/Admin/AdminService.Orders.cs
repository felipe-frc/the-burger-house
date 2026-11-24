using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed partial class AdminService
{
    public async Task<Page<OrderRow>> OrdersAsync(OrderFilter filter, CancellationToken ct)
    {
        ValidatePage(filter.Page);
        var query = db.Orders.AsNoTracking();
        if (filter.ActiveOnly)
            query = query.Where(order => order.Status != OrderStatus.Completed && order.Status != OrderStatus.Cancelled);
        if (!string.IsNullOrEmpty(filter.Channel))
        {
            if (filter.Channel is not ("delivery" or "pickup")) throw new ArgumentException("Invalid channel.");
            query = query.Where(order => order.OrderType == filter.Channel);
        }
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
    public async Task<Page<OperationalOrder>> OperationalOrdersAsync(OrderFilter filter, CancellationToken ct)
    {
        var page = await OrdersAsync(filter, ct);
        if (page.Items.Count == 0) return new([], page.Total, page.PageNumber, page.PageSize);

        var ids = page.Items.Select(row => row.Id).ToArray();
        var fulfillment = await db.Orders.AsNoTracking().Where(order => ids.Contains(order.Id))
            .Select(order => new { order.Id, order.CustomerPhone, order.Street, order.HouseNumber,
                order.Neighborhood, order.City, order.DeliveryFee, order.Discount })
            .ToDictionaryAsync(order => order.Id, ct);
        var items = await (from item in db.OrderItems.AsNoTracking()
            let orderId = EF.Property<int>(item, "OrderId")
            where ids.Contains(orderId)
            join product in db.Products on item.ProductId equals product.Id
            orderby item.Id
            select new { OrderId = orderId, Detail = new ItemDetail(product.Name, item.Quantity,
                item.UnitPrice, item.UnitPrice * item.Quantity, item.Observation, product.Category) }).ToListAsync(ct);
        var itemsByOrder = items.ToLookup(item => item.OrderId, item => item.Detail);
        var orders = page.Items.Select(row =>
        {
            var order = fulfillment[row.Id];
            var delivery = row.OrderType == "delivery";
            return new OperationalOrder(row, order.CustomerPhone, delivery ? order.Street : null,
                delivery ? order.HouseNumber : null, delivery ? order.Neighborhood : null,
                delivery ? order.City : null, order.DeliveryFee, itemsByOrder[row.Id].ToList(), order.Discount);
        }).ToList();
        return new(orders, page.Total, page.PageNumber, page.PageSize);
    }

    private async Task<IReadOnlyList<OrderRow>> Rows(IQueryable<Order> query, CancellationToken ct, List<OrderStageEvent>? history = null)
    {
        var rows = await query.Select(o => new
        {
            o.Id, o.CreatedAt, o.CustomerName, o.OrderType, ItemCount = o.Items.Sum(i => i.Quantity),
            Total = o.Items.Sum(i => i.UnitPrice * i.Quantity) - o.Discount + o.DeliveryFee, o.Status,
            PaymentMethod = db.Payments.Where(p => p.OrderId == o.Id).OrderByDescending(p => p.Id).Select(p => (PaymentMethod?)p.Method).FirstOrDefault(),
            PaymentStatus = db.Payments.Where(p => p.OrderId == o.Id).OrderByDescending(p => p.Id).Select(p => (PaymentStatus?)p.Status).FirstOrDefault(),
            ApprovedAt = db.Payments.Where(p => p.OrderId == o.Id && p.Status == PaymentStatus.Approved)
                .OrderByDescending(p => p.Id).Select(p => p.ApprovedAt).FirstOrDefault()
        }).ToListAsync(ct);
        var ids = rows.Select(row => row.Id.ToString()).ToArray();
        var events = await db.AdminAuditLogs.AsNoTracking()
            .Where(log => log.EntityType == "Order" && log.Action == "OrderStatusChanged" && ids.Contains(log.EntityId))
            .OrderByDescending(log => log.Id)
            .Select(log => new { log.EntityId, log.Changes, log.CreatedAtUtc }).ToListAsync(ct);
        if (history is not null)
        {
            foreach (var entry in events.AsEnumerable().Reverse().OrderBy(log => log.CreatedAtUtc))
                if (ReadRecordedStage(entry.Changes) is { } stage)
                    history.Add(new(stage.ToString(), DateTime.SpecifyKind(entry.CreatedAtUtc, DateTimeKind.Utc)));
        }
        var latest = events.GroupBy(log => log.EntityId).ToDictionary(group => group.Key, group => group.First());
        return rows.Select(r => new OrderRow(r.Id, r.CreatedAt, r.CustomerName, r.OrderType, r.ItemCount, r.Total,
            r.Status.ToString(), r.PaymentMethod?.ToString(), r.PaymentStatus?.ToString(),
            r.Status == OrderStatus.Received && r.ApprovedAt is { } approved ? DateTime.SpecifyKind(approved, DateTimeKind.Utc) :
            latest.TryGetValue(r.Id.ToString(), out var audit) && RecordsStage(audit.Changes, r.Status)
                ? DateTime.SpecifyKind(audit.CreatedAtUtc, DateTimeKind.Utc) : null)).ToList();
    }

    private static bool RecordsStage(string changes, OrderStatus stage)
        => ReadRecordedStage(changes) == stage;

    private static OrderStatus? ReadRecordedStage(string changes)
    {
        try
        {
            using var document = JsonDocument.Parse(changes);
            if (document.RootElement.TryGetProperty("status", out var status) && status.TryGetProperty("to", out var to) &&
                Enum.TryParse<OrderStatus>(to.GetString(), out var value) && Enum.IsDefined(value)) return value;
            return null;
        }
        catch (JsonException) { return null; }
        catch (InvalidOperationException) { return null; }
    }
    public async Task<OrderDetail?> OrderAsync(int id, CancellationToken ct)
    {
        var o = await db.Orders.AsNoTracking().SingleOrDefaultAsync(o => o.Id == id, ct);
        if (o is null) return null;
        var history = new List<OrderStageEvent>();
        var row = (await Rows(db.Orders.Where(o => o.Id == id), ct, history)).Single();
        var items = await (from item in db.OrderItems
            where EF.Property<int>(item, "OrderId") == id
            join product in db.Products on item.ProductId equals product.Id
            select new ItemDetail(product.Name, item.Quantity, item.UnitPrice, item.UnitPrice * item.Quantity, item.Observation, product.Category)).ToListAsync(ct);
        var payments = await db.Payments.AsNoTracking().Where(p => p.OrderId == id).OrderByDescending(p => p.Id)
            .Select(p => new PaymentDetail(p.Status.ToString(), p.Method.ToString(), p.Amount, p.UpdatedAt ?? p.CreatedAt)).ToListAsync(ct);
        var delivery = o.OrderType == "delivery";
        return new(row, o.CustomerPhone, delivery ? o.ZipCode : null, delivery ? o.Street : null,
            delivery ? o.HouseNumber : null, delivery ? o.Neighborhood : null, delivery ? o.City : null,
            delivery ? o.Complement : null, o.Observation, o.DeliveryFee, items, payments, history, o.Discount, o.CouponCode);
    }
    public async Task AdvanceAsync(
        int id,
        OrderStatus expected,
        OrderStatus next,
        int adminUserId,
        DateTime utcNow,
        CancellationToken ct,
        DispatchChecklist? checklist = null)
    {
        if (adminUserId <= 0)
            throw new ArgumentException(
                "Invalid admin user.",
                nameof(adminUserId)
            );

        if (utcNow.Kind != DateTimeKind.Utc)
            throw new ArgumentException(
                "Audit timestamp must be UTC.",
                nameof(utcNow)
            );

        await using var transaction =
            await db.Database.BeginTransactionAsync(ct);

        var order =
            await db.Orders.SingleOrDefaultAsync(
                o => o.Id == id,
                ct
            )
            ?? throw new KeyNotFoundException();

        if (order.Status != expected)
            throw new InvalidOperationException(
                "Order changed."
            );

        if (!await db.Payments.AnyAsync(
                p =>
                    p.OrderId == id &&
                    p.Status == PaymentStatus.Approved,
                ct))
            throw new InvalidOperationException(
                "Payment is not approved."
            );

        var isDispatch = expected == OrderStatus.ReadyForPickup;
        if (isDispatch && checklist?.IsComplete != true)
            throw new ArgumentException("Dispatch checklist is incomplete.");

        order.AdvanceStatus(next);

        var changes =
            JsonSerializer.Serialize(
                new
                {
                    status = new
                    {
                        from = expected.ToString(),
                        to = next.ToString()
                    },
                    checklist = isDispatch ? checklist : null
                }
            );

        db.AdminAuditLogs.Add(
            new AdminAuditLog(
                adminUserId,
                "Admin",
                "OrderStatusChanged",
                "Order",
                id.ToString(),
                changes,
                utcNow
            )
        );

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new InvalidOperationException(
                "Order changed."
            );
        }

        await transaction.CommitAsync(ct);
    }

}
