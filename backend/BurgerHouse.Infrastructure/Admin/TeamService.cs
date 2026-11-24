using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed class TeamService(BurgerHouseDbContext db) : ITeamService
{
    public async Task<TeamPage> ListAsync(string? search, bool? active, int page, CancellationToken ct)
    {
        if (page < 1 || page > 10000 || search?.Length > 120) throw new ArgumentException("Invalid team filter.");
        var query = db.Set<TeamMember>().AsNoTracking();
        if (active.HasValue) query = query.Where(member => member.Active == active.Value);
        // Personal fields are encrypted at rest and are searched after decryption.
        var members = await query.OrderBy(member => member.Id).ToListAsync(ct);
        var term = search?.Trim() ?? "";
        var matches = members.Where(member => member.Name.Contains(term, StringComparison.OrdinalIgnoreCase)
            || member.Email.Contains(term, StringComparison.OrdinalIgnoreCase)).ToList();
        return new(matches.Skip((page - 1) * 20).Take(20).Select(Row).ToList(), matches.Count, page, 20);
    }

    public async Task<TeamRow> CreateAsync(TeamWrite request, int ownerId, DateTime now, CancellationToken ct)
    {
        if (!request.Active || request.Revision != 0) throw new ArgumentException("New members must be active at initial revision.");
        var member = new TeamMember(request.Name, request.Email, request.Role, request.Department, request.Shift);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        db.Add(member);
        await db.SaveChangesAsync(ct);
        Audit(member, ownerId, "TeamMemberCreated", now);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Row(member);
    }

    public async Task<TeamRow> UpdateAsync(int id, TeamWrite request, int ownerId, DateTime now, CancellationToken ct)
    {
        var member = await db.Set<TeamMember>().SingleOrDefaultAsync(member => member.Id == id, ct)
            ?? throw new KeyNotFoundException();
        member.Update(request.Revision, request.Name, request.Email, request.Role, request.Department, request.Shift, request.Active);
        Audit(member, ownerId, "TeamMemberUpdated", now);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new InvalidOperationException("Stale team revision."); }
        return Row(member);
    }

    private void Audit(TeamMember member, int ownerId, string action, DateTime now) =>
        db.AdminAuditLogs.Add(new AdminAuditLog(ownerId, "Admin", action, "TeamMember", member.Id.ToString(),
            System.Text.Json.JsonSerializer.Serialize(new { member.Revision, member.Active }), now));

    private static TeamRow Row(TeamMember member) => new(member.Id, member.Name, member.Email,
        member.Role, member.Department, member.Shift, member.Active, member.Revision);
}
