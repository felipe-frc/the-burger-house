using BurgerHouse.Application.Translations;
using Xunit;

namespace BurgerHouse.Application.Tests;

public sealed class ProductTranslationValidatorTests
{
    [Fact]
    public void AcceptsFaithfulTranslation()
    {
        var translation = new ProductTranslation(
            "Special Burger",
            "180g beef burger with Canastra cheese and bacon."
        );

        Assert.True(ProductTranslationValidator.IsValid(
            "Burger Especial",
            "Hambúrguer de 180 g com queijo canastra e bacon.",
            translation
        ));
    }

    [Fact]
    public void RejectsChangedQuantity()
    {
        var translation = new ProductTranslation(
            "Special Burger",
            "200g beef burger with Canastra cheese and bacon."
        );

        Assert.False(ProductTranslationValidator.IsValid(
            "Burger Especial",
            "Hambúrguer de 180 g com queijo canastra e bacon.",
            translation
        ));
    }

    [Fact]
    public void RejectsMissingQuantity()
    {
        var translation = new ProductTranslation(
            "Special Burger",
            "Beef burger with Canastra cheese and bacon."
        );

        Assert.False(ProductTranslationValidator.IsValid(
            "Burger Especial",
            "Hambúrguer de 180 g com queijo canastra e bacon.",
            translation
        ));
    }

    [Fact]
    public void RejectsEmptyTranslation()
    {
        var translation = new ProductTranslation("", "");

        Assert.False(ProductTranslationValidator.IsValid(
            "Burger Especial",
            "Hambúrguer com queijo.",
            translation
        ));
    }

    [Fact]
    public void RejectsOversizedTranslation()
    {
        var translation = new ProductTranslation(
            new string('A', 151),
            "Beef burger with cheese."
        );

        Assert.False(ProductTranslationValidator.IsValid(
            "Burger Especial",
            "Hambúrguer com queijo.",
            translation
        ));
    }
}