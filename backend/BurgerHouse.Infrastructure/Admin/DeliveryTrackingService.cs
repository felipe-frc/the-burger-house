using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed class DeliveryTrackingService(BurgerHouseDbContext db) : IDeliveryTrackingService
{
    private IQueryable<Order> ActiveDeliveries => db.Orders.Where(x => x.OrderType == "delivery" && x.Status == OrderStatus.OutForDelivery);
    private IQueryable<TeamMember> Couriers => db.Set<TeamMember>().Where(x => x.Active && x.Role == "Entregador");

    public async Task<IReadOnlyList<CourierOption>> CouriersAsync(CancellationToken ct) =>
        (await Couriers.AsNoTracking().Select(x => new CourierOption(x.Id, x.Name)).ToListAsync(ct))
            .OrderBy(x => x.Name, StringComparer.CurrentCultureIgnoreCase).ToList();

    public async Task<DeliveryTrackingState> StatusAsync(int orderId, DateTime now, CancellationToken ct)
    {
        await RequireActiveDelivery(orderId, ct);
        var row = await db.Set<DeliveryTracking>().AsNoTracking().SingleOrDefaultAsync(x => x.OrderId == orderId, ct);
        if (row is null) return new(orderId, null, "Unassigned", null, null, null, null);
        var courier = await Couriers.AsNoTracking().Where(x => x.Id == row.CourierId).Select(x => x.Name).SingleOrDefaultAsync(ct);
        var valid = row.ExpiresAtUtc > now && courier is not null;
        var showPosition = valid && row.Sharing && row.LastReportedAtUtc > now.AddMinutes(-10);
        var state = !valid ? "Expired" : !row.Sharing ? "Stopped" : row.LastReportedAtUtc is null ? "Waiting" : row.LastReportedAtUtc <= now.AddSeconds(-90) ? "Stale" : "Active";
        return new(orderId, courier, state, row.LastReportedAtUtc is DateTime reported ? DateTime.SpecifyKind(reported, DateTimeKind.Utc) : null,
            showPosition ? row.Latitude : null, showPosition ? row.Longitude : null, showPosition ? row.Accuracy : null);
    }

    public async Task<DeliveryTrackingGrant> GrantAsync(int orderId, int courierId, int ownerId, DateTime now, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await RequireActiveDelivery(orderId, ct);
        if (!await Couriers.AnyAsync(x => x.Id == courierId, ct)) throw new ArgumentException("Selecione um entregador ativo.");
        var row = await db.Set<DeliveryTracking>().FindAsync([orderId], ct);
        if (row is null) { row = new() { OrderId = orderId }; db.Add(row); }
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        row.TokenHash = Convert.ToHexString(Hash(token));
        row.CourierId = courierId;
        row.ExpiresAtUtc = now.AddHours(4);
        row.LastReportedAtUtc = null;
        row.Sharing = false;
        row.RunId = null;
        ClearPosition(row);
        Audit(orderId, ownerId, "DeliveryTrackingGranted", new { courierId, row.ExpiresAtUtc }, now);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(orderId, token, row.ExpiresAtUtc);
    }

    public async Task RevokeAsync(int orderId, int ownerId, DateTime now, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var row = await db.Set<DeliveryTracking>().FindAsync([orderId], ct);
        if (row is null) return;
        db.Remove(row);
        Audit(orderId, ownerId, "DeliveryTrackingRevoked", new { row.CourierId }, now);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task<CourierTrackingResult> ReportAsync(int orderId, string token, CourierPositionWrite? position, DateTime now, CancellationToken ct)
    {
        if (token.Length != 64 || !token.All(char.IsAsciiHexDigit)) return CourierTrackingResult.Unauthorized;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var row = await db.Set<DeliveryTracking>().FindAsync([orderId], ct);
        if (row is null || !CryptographicOperations.FixedTimeEquals(Hash(token), Convert.FromHexString(row.TokenHash)))
            return CourierTrackingResult.Unauthorized;
        if (row.ExpiresAtUtc <= now || !await ActiveDeliveries.AnyAsync(x => x.Id == orderId, ct) || !await Couriers.AnyAsync(x => x.Id == row.CourierId, ct))
            return CourierTrackingResult.Ended;
        if (position is null)
        {
            row.Sharing = false;
            row.RunId = null;
            ClearPosition(row);
        }
        else
        {
            if (!row.Sharing || row.RunId != position.RunId) return CourierTrackingResult.Ended;
            if (!double.IsFinite(position.Latitude) || position.Latitude is < -90 or > 90 || !double.IsFinite(position.Longitude) ||
                position.Longitude is < -180 or > 180 || !double.IsFinite(position.Accuracy) || position.Accuracy is < 0 or > 10000 ||
                position.FixTime.UtcDateTime < now.AddSeconds(-45) || position.FixTime.UtcDateTime > now.AddSeconds(15))
                throw new ArgumentException("Posição inválida ou antiga.");
            if (row.LastReportedAtUtc > now.AddSeconds(-8)) return CourierTrackingResult.TooFast;
            row.Sharing = true;
            row.LastReportedAtUtc = now;
            row.Latitude = Math.Round(position.Latitude, 5);
            row.Longitude = Math.Round(position.Longitude, 5);
            row.Accuracy = Math.Ceiling(position.Accuracy);
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return CourierTrackingResult.Accepted;
    }

    public async Task<Guid?> StartAsync(int orderId, string token, DateTime now, CancellationToken ct)
    {
        if (token.Length != 64 || !token.All(char.IsAsciiHexDigit)) return null;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var row = await db.Set<DeliveryTracking>().FindAsync([orderId], ct);
        if (row is null || !CryptographicOperations.FixedTimeEquals(Hash(token), Convert.FromHexString(row.TokenHash)) ||
            row.ExpiresAtUtc <= now || !await ActiveDeliveries.AnyAsync(x => x.Id == orderId, ct) ||
            !await Couriers.AnyAsync(x => x.Id == row.CourierId, ct)) return null;
        row.RunId = Guid.NewGuid();
        row.Sharing = true;
        row.LastReportedAtUtc = null;
        ClearPosition(row);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return row.RunId;
    }

    public async Task PurgeAsync(DateTime now, CancellationToken ct)
    {
        var rows = db.Set<DeliveryTracking>();
        await rows.Where(x => x.ExpiresAtUtc <= now || !ActiveDeliveries.Any(o => o.Id == x.OrderId) || !Couriers.Any(c => c.Id == x.CourierId))
            .ExecuteDeleteAsync(ct);
        await rows.Where(x => x.LastReportedAtUtc <= now.AddMinutes(-10) && x.Latitude != null)
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.Latitude, (double?)null)
                .SetProperty(x => x.Longitude, (double?)null).SetProperty(x => x.Accuracy, (double?)null), ct);
    }

    private async Task RequireActiveDelivery(int orderId, CancellationToken ct)
    {
        if (!await ActiveDeliveries.AnyAsync(x => x.Id == orderId, ct)) throw new KeyNotFoundException("Entrega em rota indisponível.");
    }

    private void Audit(int id, int ownerId, string action, object changes, DateTime now) =>
        db.AdminAuditLogs.Add(new(ownerId, "Admin", action, "Order", id.ToString(), JsonSerializer.Serialize(changes), now));
    private static byte[] Hash(string token) => SHA256.HashData(Encoding.ASCII.GetBytes(token));
    private static void ClearPosition(DeliveryTracking row) => (row.Latitude, row.Longitude, row.Accuracy) = (null, null, null);
}
