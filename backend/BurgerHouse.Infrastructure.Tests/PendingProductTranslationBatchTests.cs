using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Translations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class PendingProductTranslationBatchTests : IAsyncLifetime
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private BurgerHouseDbContext db = null!;
    private PendingProductTranslationBatch batch = null!;

    public async Task InitializeAsync()
    {
        await connection.OpenAsync();

        db = new BurgerHouseDbContext(
            new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite(connection)
                .Options,
            TestPersonalData.Protector);

        await db.Database.MigrateAsync();
        batch = new PendingProductTranslationBatch(db);
    }

    public async Task DisposeAsync()
    {
        await db.DisposeAsync();
        await connection.DisposeAsync();
    }

    private async Task<Product> AddProduct(bool translated)
    {
        var product = Product.Create(
            "pending-test-" + Guid.NewGuid().ToString("N")[..12],
            "Burger Especial",
            "Hambúrguer com queijo e bacon.",
            32m,
            12m,
            true);

        if (translated)
        {
            product.UpdateEnglishDetails(
                "Special Burger",
                "Burger with cheese and bacon.");
        }

        db.Products.Add(product);
        await db.SaveChangesAsync();

        return product;
    }

    [Fact]
    public async Task IncludesProductsWithoutTranslations()
    {
        var product = await AddProduct(false);

        var ids = await batch.GetPendingProductIdsAsync(
            20,
            CancellationToken.None);

        Assert.Contains(product.Id, ids);
    }

    [Fact]
    public async Task ExcludesAlreadyTranslatedProducts()
    {
        var product = await AddProduct(true);

        var ids = await batch.GetPendingProductIdsAsync(
            20,
            CancellationToken.None);

        Assert.DoesNotContain(product.Id, ids);
    }

    [Fact]
    public async Task RespectsRequestedLimit()
    {
        await AddProduct(false);
        await AddProduct(false);
        await AddProduct(false);

        var ids = await batch.GetPendingProductIdsAsync(
            2,
            CancellationToken.None);

        Assert.Equal(2, ids.Count);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(21)]
    public async Task RejectsInvalidLimits(int limit)
    {
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(
            () => batch.GetPendingProductIdsAsync(
                limit,
                CancellationToken.None));
    }
}