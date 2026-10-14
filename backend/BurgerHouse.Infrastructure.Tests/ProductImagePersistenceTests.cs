using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class ProductImagePersistenceTests
{
    private const string PreviousMigration =
        "20261014165603_AddProductClassification";

    private const string ImagePath =
        "/api/product-images/0123456789abcdef0123456789abcdef.webp";

    [Fact]
    public async Task MigrationPersistsImagePreservesProductsAndSupportsRollback()
    {
        var path = Path.Combine(
            Path.GetTempPath(),
            $"burgerhouse-image-test-{Guid.NewGuid():N}.db");

        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>()
            .UseSqlite($"Data Source={path};Pooling=False")
            .Options;

        try
        {
            await using (var db = new BurgerHouseDbContext(
                options, TestPersonalData.Protector))
            {
                var migrator = db.GetService<IMigrator>();

                await migrator.MigrateAsync(PreviousMigration);

                Assert.Equal(11, await db.Products.CountAsync());

                await db.Database.ExecuteSqlRawAsync(
                    "UPDATE Products SET Price = '47.50' WHERE Id = 1");

                await migrator.MigrateAsync();

                Assert.False(db.Database.HasPendingModelChanges());

                var product = await db.Products.SingleAsync(p => p.Id == 1);

                Assert.Null(product.ImageUrl);
                Assert.Equal(47.50m, product.Price);

                product.UpdateImageUrl(ImagePath);

                await db.SaveChangesAsync();
            }

            await using (var db = new BurgerHouseDbContext(
                options, TestPersonalData.Protector))
            {
                var product = await db.Products.SingleAsync(p => p.Id == 1);

                Assert.Equal(ImagePath, product.ImageUrl);
                Assert.Equal(47.50m, product.Price);
                Assert.Equal(11, await db.Products.CountAsync());

                await db.GetService<IMigrator>()
                    .MigrateAsync(PreviousMigration);
            }

            await using (var db = new BurgerHouseDbContext(
                options, TestPersonalData.Protector))
            {
                Assert.Equal(
                    11,
                    await db.Database.SqlQueryRaw<int>(
                        "SELECT COUNT(*) AS Value FROM Products")
                        .SingleAsync());

                await db.GetService<IMigrator>().MigrateAsync();

                var product = await db.Products.SingleAsync(p => p.Id == 1);

                Assert.Null(product.ImageUrl);
                Assert.Equal(47.50m, product.Price);
                Assert.Equal(11, await db.Products.CountAsync());
                Assert.False(db.Database.HasPendingModelChanges());
            }
        }
        finally
        {
            if (File.Exists(path))
                File.Delete(path);
        }
    }
}