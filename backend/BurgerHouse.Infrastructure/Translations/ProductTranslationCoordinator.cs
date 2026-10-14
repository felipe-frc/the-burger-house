using BurgerHouse.Application.Translations;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Infrastructure.Translations;

public sealed class ProductTranslationCoordinator(
    BurgerHouseDbContext db,
    IProductTranslationService translator,
    ILogger<ProductTranslationCoordinator> logger)
{
    public async Task<bool> TranslateMissingAsync(
        int productId,
        CancellationToken cancellationToken)
    {
        if (productId <= 0)
            throw new ArgumentOutOfRangeException(nameof(productId));

        var product = await db.Products
            .AsNoTracking()
            .SingleOrDefaultAsync(
                p => p.Id == productId,
                cancellationToken);

        if (product is null)
            return false;

        if (!string.IsNullOrWhiteSpace(product.EnglishName) &&
            !string.IsNullOrWhiteSpace(product.EnglishDescription))
            return true;

        var originalName = product.Name;
        var originalDescription = product.Description;

        try
        {
            var translation = await translator.TranslateAsync(
                originalName,
                originalDescription,
                cancellationToken);

            if (!ProductTranslationValidator.IsValid(
                    originalName,
                    originalDescription,
                    translation))
            {
                logger.LogWarning(
                    "Product translation validation failed for product {ProductId}.",
                    productId);

                return false;
            }

            var updated = await db.Products
                .Where(p =>
                    p.Id == productId &&
                    p.Name == originalName &&
                    p.Description == originalDescription &&
                    p.EnglishName == "" &&
                    p.EnglishDescription == "")
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(
                            p => p.EnglishName,
                            translation.EnglishName)
                        .SetProperty(
                            p => p.EnglishDescription,
                            translation.EnglishDescription),
                    cancellationToken);

            return updated == 1;
        }
        catch (OperationCanceledException)
            when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (HttpRequestException exception)
        {
            // Translation provider exceptions may contain
            // only HTTP status and API error codes, not response bodies.
            logger.LogWarning(
                "Product translation request failed for product {ProductId}. {Diagnostic}",
                productId,
                exception.Message);

            return false;
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                "Product translation unavailable for product {ProductId}. Error type: {ErrorType}.",
                productId,
                exception.GetType().Name);

            return false;
        }
    }
}