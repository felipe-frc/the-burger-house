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
}