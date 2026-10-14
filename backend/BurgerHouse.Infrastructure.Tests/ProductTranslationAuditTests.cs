using System.Text.Json;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class ProductTranslationAuditTests : IAsyncLifetime
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private BurgerHouseDbContext db = null!;
    private AdminService service = null!;
    private int adminUserId;

    public async Task InitializeAsync()
    {
        await connection.OpenAsync();

        db = new BurgerHouseDbContext(
            new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite(connection)
                .Options,
            TestPersonalData.Protector);

        await db.Database.MigrateAsync();

        var admin = new AdminUser(
            "translation-audit@example.invalid",
            "test-password-hash");

        db.Add(admin);
        await db.SaveChangesAsync();

        adminUserId = admin.Id;
        service = new AdminService(db);
    }

    public async Task DisposeAsync()
    {
        await db.DisposeAsync();
        await connection.DisposeAsync();
    }

    private async Task<Product> CreateTranslatedProduct()
    {
        var product = Product.Create(
            "translation-audit-" + Guid.NewGuid().ToString("N")[..8],
            "Burger Especial",
            "Hambúrguer de 180 g com queijo canastra.",
            32m,
            12m,
            true);

        product.UpdateEnglishDetails(
            "Special Burger",
            "180g burger with Canastra cheese.");

        db.Products.Add(product);
        await db.SaveChangesAsync();

        return product;
    }

    [Fact]
    public async Task ChangingPortugueseDescriptionWithUpdatedEnglishPreservesTranslation()
    {
        var product = await CreateTranslatedProduct();

        await service.UpdateProductAsync(
            product.Id,
            product.Name,
            "Hambúrguer de 200 g com queijo canastra.",
            product.Price,
            product.CostPrice,
            product.IsActive,
            adminUserId,
            DateTime.UtcNow,
            CancellationToken.None,
            "Special Burger",
            "200g burger with Canastra cheese.");

        db.ChangeTracker.Clear();

        var stored = await db.Products.SingleAsync(p => p.Id == product.Id);

        Assert.Contains("200 g", stored.Description);
        Assert.Equal("Special Burger", stored.EnglishName);
        Assert.Equal(
            "200g burger with Canastra cheese.",
            stored.EnglishDescription);

        var audit = await db.AdminAuditLogs.SingleAsync(a =>
            a.Action == "ProductUpdated" &&
            a.EntityId == product.Id.ToString());

        using var json = JsonDocument.Parse(audit.Changes);

        Assert.True(json.RootElement.TryGetProperty("description", out _));

        Assert.Equal(
            "180g burger with Canastra cheese.",
            json.RootElement
                .GetProperty("englishDescription")
                .GetProperty("from")
                .GetString());

        Assert.Equal(
            "200g burger with Canastra cheese.",
            json.RootElement
                .GetProperty("englishDescription")
                .GetProperty("to")
                .GetString());
    }

    [Fact]
    public async Task ChangingPortugueseDescriptionWithoutEnglishLeavesTranslationPending()
    {
        var product = await CreateTranslatedProduct();

        await service.UpdateProductAsync(
            product.Id,
            product.Name,
            "Hambúrguer de 200 g com queijo canastra.",
            product.Price,
            product.CostPrice,
            product.IsActive,
            adminUserId,
            DateTime.UtcNow,
            CancellationToken.None,
            "",
            "");

        db.ChangeTracker.Clear();

        var stored = await db.Products.SingleAsync(p => p.Id == product.Id);

        Assert.Contains("200 g", stored.Description);
        Assert.Equal("", stored.EnglishName);
        Assert.Equal("", stored.EnglishDescription);

        var audit = await db.AdminAuditLogs.SingleAsync(a =>
            a.Action == "ProductUpdated" &&
            a.EntityId == product.Id.ToString());

        using var json = JsonDocument.Parse(audit.Changes);

        Assert.Equal(
            "Special Burger",
            json.RootElement
                .GetProperty("englishName")
                .GetProperty("from")
                .GetString());

        Assert.Equal(
            "",
            json.RootElement
                .GetProperty("englishName")
                .GetProperty("to")
                .GetString());

        Assert.Equal(
            "",
            json.RootElement
                .GetProperty("englishDescription")
                .GetProperty("to")
                .GetString());
    }

    [Fact]
    public async Task ChangingOnlyPricePreservesTranslation()
    {
        var product = await CreateTranslatedProduct();

        await service.UpdateProductAsync(
            product.Id,
            product.Name,
            product.Description,
            35m,
            product.CostPrice,
            product.IsActive,
            adminUserId,
            DateTime.UtcNow,
            CancellationToken.None,
            product.EnglishName,
            product.EnglishDescription);

        db.ChangeTracker.Clear();

        var stored = await db.Products.SingleAsync(p => p.Id == product.Id);

        Assert.Equal(35m, stored.Price);
        Assert.Equal("Special Burger", stored.EnglishName);
        Assert.Equal(
            "180g burger with Canastra cheese.",
            stored.EnglishDescription);

        var audit = await db.AdminAuditLogs
            .SingleAsync(a =>
                a.Action == "ProductUpdated" &&
                a.EntityId == product.Id.ToString());

        using var json = JsonDocument.Parse(audit.Changes);

        Assert.True(json.RootElement.TryGetProperty("price", out _));
        Assert.False(json.RootElement.TryGetProperty("englishName", out _));
        Assert.False(json.RootElement.TryGetProperty("englishDescription", out _));
    }
}