using BurgerHouse.Application.Translations;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Translations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class ProductTranslationCoordinatorTests : IAsyncLifetime
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private BurgerHouseDbContext db = null!;

    public async Task InitializeAsync()
    {
        await connection.OpenAsync();

        db = new BurgerHouseDbContext(
            new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite(connection)
                .Options,
            TestPersonalData.Protector);

        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        await db.DisposeAsync();
        await connection.DisposeAsync();
    }

    private ProductTranslationCoordinator Coordinator(IProductTranslationService service) =>
        new(db, service, NullLogger<ProductTranslationCoordinator>.Instance);

    private async Task<Product> CreateProduct()
    {
        var product = Product.Create(
            "burger-translation-test-" + Guid.NewGuid().ToString("N")[..8],
            "Burger Especial",
            "Hambúrguer de 180 g com queijo canastra e bacon.",
            32m,
            12m,
            true);

        db.Products.Add(product);
        await db.SaveChangesAsync();

        return product;
    }

    [Fact]
    public async Task SavesValidTranslation()
    {
        var product = await CreateProduct();

        var fake = new FakeTranslator((_, _) =>
            new ProductTranslation(
                "Special Burger",
                "180g beef burger with Canastra cheese and bacon."));

        var result = await Coordinator(fake).TranslateMissingAsync(
            product.Id, CancellationToken.None);

        db.ChangeTracker.Clear();

        var stored = await db.Products.SingleAsync(p => p.Id == product.Id);

        Assert.True(result);
        Assert.Equal("Special Burger", stored.EnglishName);
        Assert.Contains("Canastra cheese", stored.EnglishDescription);
        Assert.Equal(1, fake.Calls);
    }

    [Fact]
    public async Task DoesNotTranslateAlreadyTranslatedProduct()
    {
        var product = await CreateProduct();

        product.UpdateEnglishDetails(
            "Special Burger",
            "180g beef burger with Canastra cheese and bacon.");

        await db.SaveChangesAsync();

        var fake = new FakeTranslator((_, _) =>
            throw new InvalidOperationException("Should not be called"));

        var result = await Coordinator(fake).TranslateMissingAsync(
            product.Id, CancellationToken.None);

        Assert.True(result);
        Assert.Equal(0, fake.Calls);
    }

    [Fact]
    public async Task TranslationFailurePreservesProduct()
    {
        var product = await CreateProduct();

        var fake = new FakeTranslator((_, _) =>
            throw new HttpRequestException("Simulated API failure"));

        var result = await Coordinator(fake).TranslateMissingAsync(
            product.Id, CancellationToken.None);

        db.ChangeTracker.Clear();

        var stored = await db.Products.SingleAsync(p => p.Id == product.Id);

        Assert.False(result);
        Assert.Equal("Burger Especial", stored.Name);
        Assert.Equal("", stored.EnglishName);
        Assert.Equal("", stored.EnglishDescription);
    }

    [Fact]
    public async Task RejectsOutdatedTranslationAfterProductChange()
    {
        var product = await CreateProduct();

        var fake = new FakeTranslator((_, _) =>
        {
            db.Products.Local.Single(p => p.Id == product.Id)
                .UpdateDetails(
                    "Burger Especial",
                    "Hambúrguer de 200 g com queijo canastra e bacon.");

            db.SaveChanges();

            return new ProductTranslation(
                "Special Burger",
                "180g beef burger with Canastra cheese and bacon.");
        });

        var result = await Coordinator(fake).TranslateMissingAsync(
            product.Id, CancellationToken.None);

        db.ChangeTracker.Clear();

        var stored = await db.Products.SingleAsync(p => p.Id == product.Id);

        Assert.False(result);
        Assert.Contains("200 g", stored.Description);
        Assert.Equal("", stored.EnglishDescription);
    }

    private sealed class FakeTranslator(
        Func<string, string, ProductTranslation> handler)
        : IProductTranslationService
    {
        public int Calls { get; private set; }

        public Task<ProductTranslation> TranslateAsync(
            string name,
            string description,
            CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(handler(name, description));
        }
    }
}