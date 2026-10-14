using BurgerHouse.Domain.Entities;
using Xunit;

namespace BurgerHouse.Domain.Tests;

public class ProductImageUrlTests
{
    private const string ValidImage =
        "/api/product-images/0123456789abcdef0123456789abcdef.webp";

    [Fact]
    public void NewProductStartsWithoutCustomImage()
    {
        var product = new Product("test-burger", "Test Burger", 29.90m);

        Assert.Null(product.ImageUrl);
    }

    [Theory]
    [InlineData("jpg")]
    [InlineData("png")]
    [InlineData("webp")]
    public void AcceptsValidInternalImagePaths(string extension)
    {
        var product = new Product("test-burger", "Test Burger", 29.90m);

        var path =
            "/api/product-images/0123456789abcdef0123456789abcdef." +
            extension;

        product.UpdateImageUrl(path);

        Assert.Equal(path, product.ImageUrl);
    }

    [Fact]
    public void AllowsRemovingCustomImage()
    {
        var product = new Product("test-burger", "Test Burger", 29.90m);

        product.UpdateImageUrl(ValidImage);
        product.UpdateImageUrl(null);

        Assert.Null(product.ImageUrl);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    public void EmptyPathsRemoveCustomImage(string path)
    {
        var product = new Product("test-burger", "Test Burger", 29.90m);

        product.UpdateImageUrl(ValidImage);
        product.UpdateImageUrl(path);

        Assert.Null(product.ImageUrl);
    }

    [Theory]
    [InlineData("https://example.com/image.jpg")]
    [InlineData("/etc/passwd")]
    [InlineData("../image.jpg")]
    [InlineData("/api/product-images/../../secret.jpg")]
    [InlineData("/api/product-images/invalid.jpg")]
    [InlineData("/api/product-images/0123456789abcdef0123456789abcdef.svg")]
    [InlineData("/api/product-images/0123456789abcdef0123456789abcdef.JPG")]
    [InlineData("/api/product-images/0123456789abcdef0123456789abcdef.webp?x=1")]
    [InlineData("/api/product-images/0123456789abcdef0123456789abcdef.webp/")]
    public void RejectsInvalidPathsWithoutChangingExistingImage(string path)
    {
        var product = new Product("test-burger", "Test Burger", 29.90m);

        product.UpdateImageUrl(ValidImage);

        Assert.Throws<ArgumentException>(
            () => product.UpdateImageUrl(path));

        Assert.Equal(ValidImage, product.ImageUrl);
    }

    [Fact]
    public void ChangingImagePreservesOtherProductFields()
    {
        var product = new Product("test-burger", "Test Burger", 29.90m);

        product.UpdateClassification("drinks", 5);
        product.UpdateImageUrl(ValidImage);

        Assert.Equal("test-burger", product.Code);
        Assert.Equal("Test Burger", product.Name);
        Assert.Equal(29.90m, product.Price);
        Assert.Equal("drinks", product.Category);
        Assert.Equal(5, product.DisplayOrder);
        Assert.True(product.IsActive);
        Assert.Equal(ValidImage, product.ImageUrl);
    }
}