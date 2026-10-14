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
            .OrderBy(product => product.Category)
            .ThenBy(product => product.DisplayOrder)
            .ThenBy(product => product.Code)
            .Select(product =>
                new PublicProductResponse(
                    product.Code,
                    product.Name,
                    product.Description,
                    product.Price,
                    product.IsActive,
                    product.EnglishName,
                    product.EnglishDescription,
                    product.Category,
                    product.DisplayOrder
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
    bool IsActive,
    string EnglishName = "",
    string EnglishDescription = "",
    string Category = "menu",
    int DisplayOrder = 1000
);
