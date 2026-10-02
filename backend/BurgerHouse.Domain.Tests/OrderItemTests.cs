using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Domain.Tests;

public class OrderItemTests
{
    [Fact]
    public void Constructor_ShouldCreateValidOrderItem()
    {
        var item = new OrderItem(
            productId: 1,
            quantity: 2,
            unitPrice: 25.90m,
            observation: "Sem cebola"
        );

        Assert.Equal(1, item.ProductId);
        Assert.Equal(2, item.Quantity);
        Assert.Equal(25.90m, item.UnitPrice);
        Assert.Equal(51.80m, item.Total);
        Assert.Equal("Sem cebola", item.Observation);
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenProductIdIsInvalid()
    {
        Assert.Throws<ArgumentException>(
            () => new OrderItem(0, 1, 10m)
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenQuantityIsInvalid()
    {
        Assert.Throws<ArgumentException>(
            () => new OrderItem(1, 0, 10m)
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenUnitPriceIsNegative()
    {
        Assert.Throws<ArgumentException>(
            () => new OrderItem(1, 1, -1m)
        );
    }

    [Fact]
    public void Constructor_ShouldConvertEmptyObservationToNull()
    {
        var item = new OrderItem(
            1,
            1,
            10m,
            "   "
        );

        Assert.Null(item.Observation);
    }

    [Fact]
    public void Constructor_ShouldTrimObservation()
    {
        var item = new OrderItem(
            1,
            1,
            10m,
            "  Sem picles  "
        );

        Assert.Equal("Sem picles", item.Observation);
    }
}
