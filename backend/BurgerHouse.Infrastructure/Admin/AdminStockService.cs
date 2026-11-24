using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed class AdminStockService(BurgerHouseDbContext db, TimeProvider clock) : IAdminStockService
{
    public async Task<IReadOnlyList<StockRow>> ListAsync(CancellationToken ct) =>
        await db.Set<StockItem>().AsNoTracking().OrderBy(x => x.Name)
            .Select(x => new StockRow(x.Id, x.Name, x.Unit, x.Quantity, x.Minimum, x.Revision)).ToListAsync(ct);

    public async Task<StockRow> CreateAsync(StockDraft draft, int actor, CancellationToken ct)
    {
        var item = new StockItem(draft.Name, draft.Unit, draft.Minimum);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        db.Add(item);
        await db.SaveChangesAsync(ct);
        Audit(actor, "StockCreated", item.Id, """{"quantity":0}""");
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(item.Id, item.Name, item.Unit, item.Quantity, item.Minimum, item.Revision);
    }

    public async Task MoveAsync(int id, StockMove move, int actor, CancellationToken ct)
    {
        if (move.RequestId == Guid.Empty || string.IsNullOrWhiteSpace(move.Reason) || move.Reason.Trim().Length > 300)
            throw new ArgumentException("A movement reason and request ID are required.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var previous = await db.Set<StockMovement>().FindAsync([move.RequestId], ct);
        if (previous != null)
        {
            if (previous.StockItemId != id || previous.Delta != move.Delta || previous.Reason != move.Reason.Trim() || previous.ActorId != actor)
                throw new InvalidOperationException("Request ID already used.");
            return;
        }
        var item = await db.Set<StockItem>().SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new KeyNotFoundException();
        item.Move(move.Delta, move.Revision);
        db.Add(new StockMovement { Id = move.RequestId, StockItemId = id, Delta = move.Delta,
            Balance = item.Quantity, Reason = move.Reason.Trim(), ActorId = actor, CreatedAt = clock.GetUtcNow().UtcDateTime });
        Audit(actor, "StockMovement", id, System.Text.Json.JsonSerializer.Serialize(new { move.RequestId, move.Delta, item.Quantity, item.Revision }));
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new InvalidOperationException("Stock changed."); }
        await transaction.CommitAsync(ct);
    }

    public async Task<IReadOnlyList<StockHistory>> HistoryAsync(int id, int page, CancellationToken ct)
    {
        if (page < 1 || page > 100000) throw new ArgumentException("Invalid page.");
        var rows = await db.Set<StockMovement>().AsNoTracking().Where(x => x.StockItemId == id)
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * 50).Take(50)
            .Select(x => new StockHistory(x.Id, x.Delta, x.Balance, x.Reason, x.CreatedAt)).ToListAsync(ct);
        return rows.Select(row => row with { CreatedAt = DateTime.SpecifyKind(row.CreatedAt, DateTimeKind.Utc) }).ToList();
    }
    private void Audit(int actor, string action, int id, string changes) => db.AdminAuditLogs.Add(
        new AdminAuditLog(actor, "Admin", action, "StockItem", id.ToString(), changes, clock.GetUtcNow().UtcDateTime));
}
