using System.Text.Json;
using BurgerHouse.Api.Images;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Tests;

public sealed class ProductImageAssignmentTests
{
    private const string ImagePath =
        "/api/product-images/0123456789abcdef0123456789abcdef.webp";

    [Fact]
    public async Task SavesImageAndCreatesAuditLog()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var db = new BurgerHouseDbContext(
            options, TestPersonalData.Protector);

        await db.Database.MigrateAsync();

        var owner = new AdminUser(
            "image-owner@example.invalid",
            "test-hash");

        db.Add(owner);
        await db.SaveChangesAsync();

        var service = new ProductImageAssignmentService(db);
        var now = DateTime.UtcNow;

        var previous = await service.SetImageAsync(
            1, ImagePath, owner.Id, now);

        Assert.Null(previous);

        await using var reload = new BurgerHouseDbContext(
            options, TestPersonalData.Protector);

        var product = await reload.Products.SingleAsync(p => p.Id == 1);

        Assert.Equal(ImagePath, product.ImageUrl);

        var audit = await reload.AdminAuditLogs.SingleAsync(
            a => a.Action == "ProductImageUpdated");

        Assert.Equal(owner.Id, audit.AdminUserId);
        Assert.Equal("Product", audit.EntityType);
        Assert.Equal("1", audit.EntityId);

        using var json = JsonDocument.Parse(audit.Changes);

        var change = json.RootElement.GetProperty("imageUrl");

        Assert.Equal(JsonValueKind.Null, change.GetProperty("from").ValueKind);
        Assert.Equal(ImagePath, change.GetProperty("to").GetString());
    }

    [Fact]
    public async Task RepeatingSameImageDoesNotDuplicateAudit()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var db = new BurgerHouseDbContext(
            options, TestPersonalData.Protector);

        await db.Database.MigrateAsync();

        var owner = new AdminUser(
            "repeat-owner@example.invalid",
            "test-hash");

        db.Add(owner);
        await db.SaveChangesAsync();

        var service = new ProductImageAssignmentService(db);

        await service.SetImageAsync(
            1, ImagePath, owner.Id, DateTime.UtcNow);

        var previous = await service.SetImageAsync(
            1, ImagePath, owner.Id, DateTime.UtcNow);

        Assert.Equal(ImagePath, previous);

        Assert.Equal(
            1,
            await db.AdminAuditLogs.CountAsync(
                a => a.Action == "ProductImageUpdated"));
    }

    [Fact]
    public async Task AuditFailureRollsBackProductImage()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var db = new BurgerHouseDbContext(
            options, TestPersonalData.Protector);

        await db.Database.MigrateAsync();

        var owner = new AdminUser(
            "rollback-owner@example.invalid",
            "test-hash");

        db.Add(owner);
        await db.SaveChangesAsync();

        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TRIGGER reject_product_image_audit
            BEFORE INSERT ON AdminAuditLogs
            WHEN NEW.Action = 'ProductImageUpdated'
            BEGIN
                SELECT RAISE(ABORT, 'test audit failure');
            END;
            """);

        var service = new ProductImageAssignmentService(db);

        await Assert.ThrowsAsync<DbUpdateException>(
            () => service.SetImageAsync(
                1, ImagePath, owner.Id, DateTime.UtcNow));

        await using var reload = new BurgerHouseDbContext(
            options, TestPersonalData.Protector);

        var product = await reload.Products
            .AsNoTracking()
            .SingleAsync(p => p.Id == 1);

        Assert.Null(product.ImageUrl);

        Assert.Equal(
            0,
            await reload.AdminAuditLogs.CountAsync(
                a => a.Action == "ProductImageUpdated"));
    }
}