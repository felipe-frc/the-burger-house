using System.Text.Json;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Images;

public sealed class ProductImageAssignmentService(
    BurgerHouseDbContext db)
{
    public async Task<string?> SetImageAsync(
        int productId,
        string? imageUrl,
        int adminUserId,
        DateTime utcNow,
        CancellationToken cancellationToken = default)
    {
        if (productId <= 0)
            throw new ArgumentOutOfRangeException(nameof(productId));

        if (adminUserId <= 0)
            throw new ArgumentOutOfRangeException(nameof(adminUserId));

        if (utcNow.Kind != DateTimeKind.Utc)
            throw new ArgumentException(
                "Audit timestamp must be UTC.",
                nameof(utcNow));

        await using var transaction =
            await db.Database.BeginTransactionAsync(cancellationToken);

        var product = await db.Products.SingleOrDefaultAsync(
            candidate => candidate.Id == productId,
            cancellationToken)
            ?? throw new KeyNotFoundException("Product not found.");

        var previousImageUrl = product.ImageUrl;

        product.UpdateImageUrl(imageUrl);

        if (string.Equals(
            previousImageUrl,
            product.ImageUrl,
            StringComparison.Ordinal))
        {
            return previousImageUrl;
        }

        var changes = new
        {
            imageUrl = new
            {
                from = previousImageUrl,
                to = product.ImageUrl
            }
        };

        db.AdminAuditLogs.Add(
            new AdminAuditLog(
                adminUserId,
                "Admin",
                "ProductImageUpdated",
                "Product",
                product.Id.ToString(),
                JsonSerializer.Serialize(changes),
                utcNow));

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return previousImageUrl;
    }
}