using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Admin;

public sealed partial class AdminService
{
    public async Task<IReadOnlyList<ProductRow>> ProductsAsync(CancellationToken ct) =>
        await db.Products.AsNoTracking().OrderBy(p => p.Category).ThenBy(p => p.DisplayOrder).ThenBy(p => p.Code)
            .Select(p => new ProductRow(p.Id, p.Name, p.Description, p.Price, p.CostPrice, p.IsActive, p.EnglishName,
                p.EnglishDescription, p.Category, p.DisplayOrder, p.ImageUrl, p.Code)).ToListAsync(ct);
    public async Task<int> CreateProductAsync(
        string name,
        string description,
        decimal price,
        decimal? cost,
        bool active,
        int adminUserId,
        DateTime utcNow,
        CancellationToken ct, string? englishName = null, string? englishDescription = null, string category = "menu", int displayOrder = 1000)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 150)
            throw new ArgumentException("Invalid product name.", nameof(name));

        if (string.IsNullOrWhiteSpace(description) || description.Trim().Length > 500)
            throw new ArgumentException("Invalid product description.", nameof(description));

        if (price <= 0 || price > 99999999.99m || decimal.Round(price, 2) != price)
            throw new ArgumentException("Invalid product price.", nameof(price));

        if (adminUserId <= 0)
            throw new ArgumentException("Invalid admin user.", nameof(adminUserId));

        if (utcNow.Kind != DateTimeKind.Utc)
            throw new ArgumentException("Audit timestamp must be UTC.", nameof(utcNow));

        var normalized = name.Trim().Normalize(System.Text.NormalizationForm.FormD);
        var slug = new System.Text.StringBuilder();

        foreach (var character in normalized)
        {
            var unicodeCategory = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(character);

            if (unicodeCategory == System.Globalization.UnicodeCategory.NonSpacingMark)
                continue;

            var lower = char.ToLowerInvariant(character);

            if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9'))
                slug.Append(lower);
            else if (slug.Length > 0 && slug[slug.Length - 1] != '-')
                slug.Append('-');
        }

        var prefix = slug.ToString().Trim('-');

        if (string.IsNullOrEmpty(prefix))
            prefix = "produto";

        if (prefix.Length > 87)
            prefix = prefix.Substring(0, 87).TrimEnd('-');

        var code = $"{prefix}-{Guid.NewGuid():N}".Substring(0, prefix.Length + 13);

        var product = Product.Create(
            code,
            name,
            description,
            price,
            cost,
            active
        );

        product.UpdateEnglishDetails(englishName, englishDescription);
        product.UpdateClassification(category, displayOrder);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        db.Products.Add(product);
        await db.SaveChangesAsync(ct);

        var changes = new
        {
            code = product.Code,
            name = product.Name,
            description = product.Description,
            englishName = product.EnglishName,
            englishDescription = product.EnglishDescription,
            price = product.Price,
            costPrice = product.CostPrice,
            isActive = product.IsActive,
            category = product.Category,
            displayOrder = product.DisplayOrder
        };

        db.AdminAuditLogs.Add(
            new AdminAuditLog(
                adminUserId,
                "Admin",
                "ProductCreated",
                "Product",
                product.Id.ToString(),
                JsonSerializer.Serialize(changes),
                utcNow
            )
        );

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return product.Id;
    }
    public async Task UpdateProductAsync(
        int id,
        string name,
        string description,
        decimal price,
        decimal? cost,
        bool active,
        int adminUserId,
        DateTime utcNow,
        CancellationToken ct, string? englishName = null, string? englishDescription = null, string? category = null, int? displayOrder = null)
    {
        if (string.IsNullOrWhiteSpace(name) ||
            name.Trim().Length > 150)
            throw new ArgumentException("Invalid product name.");

        if (string.IsNullOrWhiteSpace(description) ||
            description.Trim().Length > 500)
            throw new ArgumentException("Invalid product description.");
        if (price <= 0 ||
            price > 99999999.99m ||
            decimal.Round(price, 2) != price)
            throw new ArgumentException("Invalid price.");

        if (adminUserId <= 0)
            throw new ArgumentException(
                "Invalid admin user.",
                nameof(adminUserId)
            );

        if (utcNow.Kind != DateTimeKind.Utc)
            throw new ArgumentException(
                "Audit timestamp must be UTC.",
                nameof(utcNow)
            );

        var product =
            await db.Products.SingleOrDefaultAsync(
                p => p.Id == id,
                ct
            )
            ?? throw new KeyNotFoundException();

        var changes =
            new Dictionary<string, object?>();
        var normalizedName =
            name.Trim();

        var normalizedDescription =
            description.Trim();

        if (!string.Equals(
                product.Name,
                normalizedName,
                StringComparison.Ordinal
            ))
        {
            changes["name"] =
                new
                {
                    from = product.Name,
                    to = normalizedName
                };
        }

        if (!string.Equals(
                product.Description,
                normalizedDescription,
                StringComparison.Ordinal
            ))
        {
            changes["description"] =
                new
                {
                    from = product.Description,
                    to = normalizedDescription
                };
        }


        // Preserva traducoes revisadas no formulario.
        // Campos vazios continuam pendentes para o Azure Translator.
        var normalizedEnglishName = englishName?.Trim() ?? string.Empty;

        var normalizedEnglishDescription = englishDescription?.Trim() ?? string.Empty;

        if (!string.Equals(product.EnglishName, normalizedEnglishName, StringComparison.Ordinal))
        {
            changes["englishName"] = new
            {
                from = product.EnglishName,
                to = normalizedEnglishName
            };
        }

        if (!string.Equals(product.EnglishDescription, normalizedEnglishDescription, StringComparison.Ordinal))
        {
            changes["englishDescription"] = new
            {
                from = product.EnglishDescription,
                to = normalizedEnglishDescription
            };
        }
        if (product.Price != price)
        {
            changes["price"] = new
            {
                from = product.Price,
                to = price
            };
        }

        if (product.CostPrice != cost)
        {
            changes["costPrice"] = new
            {
                from = product.CostPrice,
                to = cost
            };
        }

        if (product.IsActive != active)
        {
            changes["isActive"] = new
            {
                from = product.IsActive,
                to = active
            };
        }

        var nextCategory = category ?? product.Category;
        var nextDisplayOrder = displayOrder ?? product.DisplayOrder;
        if (product.Category != nextCategory)
            changes["category"] = new { from = product.Category, to = nextCategory };
        if (product.DisplayOrder != nextDisplayOrder)
            changes["displayOrder"] = new { from = product.DisplayOrder, to = nextDisplayOrder };

        product.UpdateClassification(nextCategory, nextDisplayOrder);
        if (changes.Count == 0)
            return;

        product.UpdateCost(cost);
        product.UpdateDetails(
            normalizedName,
            normalizedDescription
        );
        product.UpdatePrice(price);

        // Preserva a traducao revisada pelo administrador.
        // Campos vazios ficam pendentes para o Azure Translator.
        product.UpdateEnglishDetails(
            normalizedEnglishName,
            normalizedEnglishDescription
        );

        if (active)
            product.Activate();
        else
            product.Deactivate();

        db.AdminAuditLogs.Add(
            new AdminAuditLog(
                adminUserId,
                "Admin",
                "ProductUpdated",
                "Product",
                id.ToString(),
                JsonSerializer.Serialize(changes),
                utcNow
            )
        );

        await db.SaveChangesAsync(ct);
    }

}
