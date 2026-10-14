using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Domain.Tests;

public class ProductTests
{
    [Theory]
    [InlineData("menu", 0)]
    [InlineData("sides", 12)]
    [InlineData("drinks", 999999)]
    public void ClassificationPreservesOtherFields(string category, int position)
    {
        var product = Product.Create("test", "Produto", "Descrição", 20, 5, false);
        product.UpdateEnglishDetails("Product", "Description");
        Assert.Equal("menu", product.Category);
        Assert.Equal(1000, product.DisplayOrder);
        product.UpdateClassification(category, position);
        Assert.Equal(category, product.Category);
        Assert.Equal(position, product.DisplayOrder);
        Assert.Equal(20, product.Price);
        Assert.Equal(5, product.CostPrice);
        Assert.Equal("Product", product.EnglishName);
        Assert.False(product.IsActive);
    }

    [Theory]
    [InlineData("unknown", 0)]
    [InlineData("", 0)]
    [InlineData(null, 0)]
    [InlineData("menu", -1)]
    [InlineData("menu", 1000000)]
    public void InvalidClassificationDoesNotMutateProduct(string? category, int position)
    {
        var product = new Product("test", "Produto", 20);
        Assert.ThrowsAny<ArgumentException>(() => product.UpdateClassification(category!, position));
        Assert.Equal("menu", product.Category);
        Assert.Equal(1000, product.DisplayOrder);
    }
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
