using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Repositories;

public class ProductRepository : IProductRepository
{
    private readonly BurgerHouseDbContext _dbContext;

    public ProductRepository(BurgerHouseDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Product?> GetByCodeAsync(
        string code,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(code))
            return null;

        var normalizedCode = code.Trim();

        return await _dbContext.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(
                product =>
                    product.Code == normalizedCode &&
                    product.IsActive,
                cancellationToken
            );
    }
    public async Task<IReadOnlyList<Product>> GetByCodesAsync(
        IReadOnlyCollection<string> codes, CancellationToken cancellationToken = default)
    {
        var normalized = codes.Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code.Trim()).Distinct(StringComparer.Ordinal).ToArray();
        if (normalized.Length == 0) return Array.Empty<Product>();
        return await _dbContext.Products.AsNoTracking()
            .Where(product => product.IsActive && normalized.Contains(product.Code))
            .ToListAsync(cancellationToken);
    }
}