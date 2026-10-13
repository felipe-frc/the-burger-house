using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/products")]
public sealed class ProductsController(
    BurgerHouseDbContext dbContext)
    : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<PublicProductResponse>> Get(
        CancellationToken cancellationToken)
    {
        return await dbContext.Products
            .AsNoTracking()
            .OrderBy(product => product.Id)
            .Select(product =>
                new PublicProductResponse(
                    product.Code,
                    product.Name,
                    product.Description,
                    product.Price,
                    product.IsActive
                )
            )
            .ToListAsync(
                cancellationToken
            );
    }
}

public sealed record PublicProductResponse(
    string Code,
    string Name,
    string Description,
    decimal Price,
    bool IsActive
);