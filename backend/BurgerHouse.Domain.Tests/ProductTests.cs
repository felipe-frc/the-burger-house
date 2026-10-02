using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Domain.Tests;

public class ProductTests
{
    [Fact]
    public void Constructor_ShouldCreateActiveProduct()
    {
        var product = new Product(
            "burger-praiano",
            "O Praiano",
            43.90m
        );

        Assert.Equal("burger-praiano", product.Code);
        Assert.Equal("O Praiano", product.Name);
        Assert.Equal(43.90m, product.Price);
        Assert.True(product.IsActive);
    }

    [Fact]
    public void Constructor_ShouldTrimCodeAndName()
    {
        var product = new Product(
            "  burger-praiano  ",
            "  O Praiano  ",
            43.90m
        );

        Assert.Equal("burger-praiano", product.Code);
        Assert.Equal("O Praiano", product.Name);
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenCodeIsEmpty()
    {
        Assert.Throws<ArgumentException>(
            () => new Product("   ", "O Praiano", 43.90m)
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenNameIsEmpty()
    {
        Assert.Throws<ArgumentException>(
            () => new Product("burger-praiano", "   ", 43.90m)
        );
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenPriceIsInvalid()
    {
        Assert.Throws<ArgumentException>(
            () => new Product("burger-praiano", "O Praiano", 0m)
        );
    }

    [Fact]
    public void UpdatePrice_ShouldChangePrice()
    {
        var product = new Product(
            "burger-praiano",
            "O Praiano",
            43.90m
        );

        product.UpdatePrice(45.90m);

        Assert.Equal(45.90m, product.Price);
    }

    [Fact]
    public void UpdatePrice_ShouldThrow_WhenPriceIsInvalid()
    {
        var product = new Product(
            "burger-praiano",
            "O Praiano",
            43.90m
        );

        Assert.Throws<ArgumentException>(
            () => product.UpdatePrice(0m)
        );
    }

    [Fact]
    public void Deactivate_ShouldSetProductAsInactive()
    {
        var product = new Product(
            "burger-praiano",
            "O Praiano",
            43.90m
        );

        product.Deactivate();

        Assert.False(product.IsActive);
    }

    [Fact]
    public void Activate_ShouldSetProductAsActive()
    {
        var product = new Product(
            "burger-praiano",
            "O Praiano",
            43.90m
        );

        product.Deactivate();
        product.Activate();

        Assert.True(product.IsActive);
    }
}
