using System.Text.Json;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class ProductClassificationTests
{
    [Fact]
    public async Task MigrationPreservesHistoricalProductsAndOrdersAndSupportsRollback()
    {
        var path = Path.Combine(Path.GetTempPath(), $"product-classification-{Guid.NewGuid()}.db");
        try
        {
            await using var db = new BurgerHouseDbContext(new DbContextOptionsBuilder<BurgerHouseDbContext>()
                .UseSqlite($"Data Source={path};Pooling=False").Options, TestPersonalData.Protector);
            var migrator = db.GetService<IMigrator>();
            const string previous = "20261014152547_DropGeminiTranslationUsage";
            await migrator.MigrateAsync(previous);
            await db.Database.ExecuteSqlRawAsync("UPDATE Products SET Price = '47.50', EnglishName = 'Beach', EnglishDescription = 'Revised', IsActive = 0 WHERE Id = 1");
            await db.Database.ExecuteSqlRawAsync("INSERT INTO Products(Code,Name,Description,Price,IsActive) VALUES('later-product','Novo','Descrição','12.00',1)");
            var order = new Order(0, "pickup", "Teste", "11999990000", "cliente@teste.com", "52998224725");
            order.AddItem(new OrderItem(1, 1, 47.5m));
            db.Orders.Add(order);
            await db.SaveChangesAsync();
            var sql = migrator.GenerateScript(previous);
            Assert.DoesNotContain("DROP TABLE", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("DELETE FROM", sql, StringComparison.OrdinalIgnoreCase);
            await migrator.MigrateAsync();
            Assert.False(db.Database.HasPendingModelChanges());
            var products = await db.Products.OrderBy(p => p.Id).ToListAsync();
            Assert.Equal(12, products.Count);
            foreach (var product in products.Take(11))
            {
                Assert.Equal(product.Id <= 6 ? "menu" : product.Id <= 9 ? "sides" : "drinks", product.Category);
                Assert.Equal(product.Id <= 6 ? product.Id : product.Id <= 9 ? product.Id - 6 : product.Id - 9, product.DisplayOrder);
            }
            Assert.Equal("menu", products[11].Category);
            Assert.Equal(1000, products[11].DisplayOrder);
            Assert.Equal(47.5m, products[0].Price);
            Assert.Equal("Beach", products[0].EnglishName);
            Assert.False(products[0].IsActive);
            await migrator.MigrateAsync(previous);
            Assert.Equal(12, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM Products").SingleAsync());
            Assert.Equal(1, await db.Orders.CountAsync());
            Assert.Equal(1, await db.Set<OrderItem>().Select(i => i.ProductId).SingleAsync());
            await migrator.MigrateAsync();
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task AdminCreatesUpdatesAuditsAndPersistsClassificationWithoutChangingOtherFields()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(connection).Options;
        await using var db = new BurgerHouseDbContext(options, TestPersonalData.Protector);
        await db.Database.MigrateAsync();
        var admin = new AdminUser("classification@example.invalid", "test-hash");
        db.Add(admin);
        await db.SaveChangesAsync();
        var service = new AdminService(db);
        var id = await service.CreateProductAsync("Produto", "Descrição", 20, 5, false, admin.Id,
            DateTime.UtcNow, default, "Product", "Description", "sides", 0);
        await service.UpdateProductAsync(id, "Produto", "Descrição", 20, 5, false, admin.Id,
            DateTime.UtcNow, default, "Product", "Description", "drinks", 3);
        await using var reload = new BurgerHouseDbContext(options, TestPersonalData.Protector);
        var stored = await reload.Products.SingleAsync(p => p.Id == id);
        Assert.Equal("drinks", stored.Category);
        Assert.Equal(3, stored.DisplayOrder);
        Assert.Equal(20, stored.Price);
        Assert.Equal(5, stored.CostPrice);
        Assert.False(stored.IsActive);
        Assert.Equal("Product", stored.EnglishName);
        using var audit = JsonDocument.Parse((await db.AdminAuditLogs.SingleAsync(a => a.Action == "ProductUpdated")).Changes);
        Assert.Equal("sides", audit.RootElement.GetProperty("category").GetProperty("from").GetString());
        Assert.Equal("drinks", audit.RootElement.GetProperty("category").GetProperty("to").GetString());
        Assert.Equal(0, audit.RootElement.GetProperty("displayOrder").GetProperty("from").GetInt32());
        Assert.Equal(3, audit.RootElement.GetProperty("displayOrder").GetProperty("to").GetInt32());
        var row = Assert.Single(await service.ProductsAsync(default), p => p.Id == id);
        Assert.Equal("drinks", row.Category);
        Assert.Equal(3, row.DisplayOrder);
    }
}
