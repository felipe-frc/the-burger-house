using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Translations;

public sealed class PendingProductTranslationBatch(
    BurgerHouseDbContext db)
{
    public async Task<IReadOnlyList<int>> GetPendingProductIdsAsync(
        int limit,
        CancellationToken cancellationToken)
    {
        if (limit < 1 || limit > 20)
            throw new ArgumentOutOfRangeException(nameof(limit));

        return await db.Products
            .AsNoTracking()
            .Where(product =>
                product.EnglishName == "" ||
                product.EnglishDescription == "")
            .OrderBy(product => product.Id)
            .Select(product => product.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);
    }
}