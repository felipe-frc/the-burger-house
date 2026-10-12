using System.Security.Cryptography;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed class AdminIdentity(BurgerHouseDbContext db) : IAdminIdentity
{
    private static readonly PasswordHasher<AdminUser> Hasher = new();
    // Equal hashing work for unknown accounts; generated in memory, never a usable credential.
    private static readonly AdminUser Dummy = new("timing@example.invalid", "unused");
    private static readonly string DummyHash = Hasher.HashPassword(Dummy, Convert.ToHexString(RandomNumberGenerator.GetBytes(32)));

    public async Task<OwnerIdentity?> AuthenticateAsync(string email, string password, CancellationToken ct)
    {
        var normalized = email.Trim().ToUpperInvariant();
        var user = await db.Set<AdminUser>().SingleOrDefaultAsync(u => u.Email == normalized, ct);
        var result = Hasher.VerifyHashedPassword(user ?? Dummy, user?.PasswordHash ?? DummyHash, password);
        if (user is null || result == PasswordVerificationResult.Failed) return null;
        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.ReplaceHash(Hasher.HashPassword(user, password));
            await db.SaveChangesAsync(ct);
        }
        return new(user.Id, user.Email);
    }
    public async Task<string> CreateSessionAsync(int ownerId, DateTime expiresAt, CancellationToken ct)
    {
        await db.Set<AdminSession>().Where(s => s.ExpiresAt <= DateTime.UtcNow).ExecuteDeleteAsync(ct);
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        db.Add(new AdminSession { Id = Hash(id), AdminUserId = ownerId, ExpiresAt = expiresAt });
        await db.SaveChangesAsync(ct);
        return id;
    }
    public Task<bool> IsSessionValidAsync(int ownerId, string sessionId, DateTime now, CancellationToken ct) =>
        db.Set<AdminSession>().AnyAsync(s => s.Id == Hash(sessionId) && s.AdminUserId == ownerId && s.ExpiresAt > now, ct);
    public async Task RevokeSessionAsync(string sessionId, CancellationToken ct) =>
        await db.Set<AdminSession>().Where(s => s.Id == Hash(sessionId)).ExecuteDeleteAsync(ct);
    public async Task<bool> ChangePasswordAsync(int ownerId, string currentPassword, string newPassword, CancellationToken ct)
    {
        ValidatePassword(newPassword);

        var user = await db.Set<AdminUser>().SingleOrDefaultAsync(u => u.Id == ownerId, ct);
        if (user is null) return false;

        var verification = Hasher.VerifyHashedPassword(user, user.PasswordHash, currentPassword);
        if (verification == PasswordVerificationResult.Failed) return false;

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        user.ReplaceHash(Hasher.HashPassword(user, newPassword));
        await db.SaveChangesAsync(ct);

        await db.Set<AdminSession>()
            .Where(s => s.AdminUserId == ownerId)
            .ExecuteDeleteAsync(ct);

        await transaction.CommitAsync(ct);

        return true;
    }

    public async Task ResetOwnerPasswordAsync(string newPassword, CancellationToken ct)
    {
        ValidatePassword(newPassword);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var user = await db.Set<AdminUser>().SingleOrDefaultAsync(ct)
            ?? throw new InvalidOperationException("Owner does not exist.");

        user.ReplaceHash(Hasher.HashPassword(user, newPassword));
        await db.SaveChangesAsync(ct);

        await db.Set<AdminSession>()
            .Where(s => s.AdminUserId == user.Id)
            .ExecuteDeleteAsync(ct);

        await transaction.CommitAsync(ct);
    }

    private static void ValidatePassword(string password)
    {
        if (password.Length is < 14 or > 128)
            throw new ArgumentException("Use a unique password of 14 to 128 characters.");
    }
    private static string Hash(string id) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(id)));
    public async Task CreateFirstOwnerAsync(string email, string password, CancellationToken ct)
    {
        if (password.Length is < 14 or > 128) throw new ArgumentException("Use a unique password of 14 to 128 characters.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (await db.Set<AdminUser>().AnyAsync(ct)) throw new InvalidOperationException("An Owner already exists.");
        var user = new AdminUser(email, "pending");
        user.ReplaceHash(Hasher.HashPassword(user, password));
        db.Add(user);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }
}
