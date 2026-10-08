using BurgerHouse.Domain.Entities;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BurgerHouse.Infrastructure.Tests;

public class OrderFulfillmentPersistenceTests
{
    [Fact]
    public async Task UpgradesPreviousSchemaWithoutInventingHistoricalPersonalData()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = Create(connection);
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261001223640_RemoveMercadoPagoProvider");
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO Orders (Id,DeliveryFee,Status,CreatedAt) VALUES (1,'5',1,'2026-10-01')");
        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO OrderItems (OrderId,ProductId,Quantity,UnitPrice,Observation) VALUES (1,1,2,'43.9','legacy')");
        await migrator.MigrateAsync();
        var historical = await db.Orders.Include(o => o.Items).SingleAsync();
        Assert.Equal(1, historical.Id);
        Assert.Equal(5m, historical.DeliveryFee);
        Assert.Equal(92.8m, historical.Total);
        Assert.Equal("", historical.CustomerName);
        Assert.Equal("", historical.CustomerPhone);
        Assert.Equal("", historical.OrderType);
        Assert.Null(historical.Street);
        Assert.Equal("legacy", historical.Items.Single().Observation);
        Assert.False(db.Database.HasPendingModelChanges());
        db.ChangeTracker.Clear();
        await migrator.MigrateAsync("20261001223640_RemoveMercadoPagoProvider");
        Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM Orders").SingleAsync());
    }

    [Theory]
    [InlineData("delivery", 5)]
    [InlineData("pickup", 0)]
    public async Task FreshDatabasePersistsFulfillmentBeforeAnyPaymentOrWhatsapp(string type, int fee)
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using (var db = Create(connection))
        {
            await db.Database.MigrateAsync();
            var handler = new CreateOrderHandler(new ProductRepository(db), new OrderRepository(db));
            var result = await handler.HandleAsync(new CreateOrderRequest
            {
                OrderType = type, CustomerName = " Cliente Teste ", CustomerPhone = " 11999990000 ",
                CustomerEmail = "cliente@teste.com",
                CustomerTaxId = "52998224725",
                ZipCode = type == "delivery" ? "38400-000" : null,
                Street = type == "delivery" ? " Rua Teste " : null,
                HouseNumber = type == "delivery" ? "10" : null,
                Neighborhood = type == "delivery" ? "Centro" : null,
                City = type == "delivery" ? "Cidade" : null,
                Complement = type == "delivery" ? " Apto " : null,
                Observation = " Sem cebola ",
                Items = [new() { ProductCode = "burger-praiano", Quantity = 1, Observation = "item" }]
            });
            Assert.Equal(43.9m + fee, result.Total);
            Assert.Empty(await db.Payments.ToListAsync());
        }
        await using (var db = Create(connection))
        {
            var saved = await db.Orders.Include(o => o.Items).SingleAsync();
            Assert.Equal(type, saved.OrderType);
            Assert.Equal("Cliente Teste", saved.CustomerName);
            Assert.Equal("11999990000", saved.CustomerPhone);
            Assert.Equal("Sem cebola", saved.Observation);
            Assert.Equal(type == "delivery" ? "38400-000" : null, saved.ZipCode);
            Assert.Equal(type == "delivery" ? "Rua Teste" : null, saved.Street);
            Assert.Equal(type == "delivery" ? "10" : null, saved.HouseNumber);
            Assert.Equal(type == "delivery" ? "Centro" : null, saved.Neighborhood);
            Assert.Equal(type == "delivery" ? "Cidade" : null, saved.City);
            Assert.Equal(type == "delivery" ? "Apto" : null, saved.Complement);
            Assert.Equal("item", saved.Items.Single().Observation);
            Assert.Equal(fee, saved.DeliveryFee);
            Assert.False(db.Database.HasPendingModelChanges());
        }
    }

    private static BurgerHouseDbContext Create(SqliteConnection connection) =>
        new(new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(connection).Options);
}