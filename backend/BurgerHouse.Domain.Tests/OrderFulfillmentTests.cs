using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Domain.Tests;

public class OrderFulfillmentTests
{
    private static Order Create(string type = "delivery", string? name = " Cliente Teste ",
        string? phone = " 11999990000 ", string? zip = " 38400-000 ", string? street = " Rua Teste ",
        string? number = " 10 ", string? neighborhood = " Centro ", string? city = " Cidade ",
        string? complement = " Apto ", string? observation = " Sem cebola ") =>
        new(5, type, name!, phone!, zip, street, number, neighborhood, city, complement, observation);

    [Fact]
    public void DeliveryTrimsAllFields()
    {
        var order = Create(" DELIVERY ");
        Assert.Equal("delivery", order.OrderType);
        Assert.Equal("Cliente Teste", order.CustomerName);
        Assert.Equal("11999990000", order.CustomerPhone);
        Assert.Equal("38400-000", order.ZipCode);
        Assert.Equal("Rua Teste", order.Street);
        Assert.Equal("10", order.HouseNumber);
        Assert.Equal("Centro", order.Neighborhood);
        Assert.Equal("Cidade", order.City);
        Assert.Equal("Apto", order.Complement);
        Assert.Equal("Sem cebola", order.Observation);
    }

    [Fact]
    public void PickupAllowsNullAddressAndOptionalFields()
    {
        var order = new Order(0, "pickup", "Cliente Teste", "11999990000", observation: " ");
        Assert.Null(order.ZipCode);
        Assert.Null(order.Street);
        Assert.Null(order.HouseNumber);
        Assert.Null(order.Neighborhood);
        Assert.Null(order.City);
        Assert.Null(order.Complement);
        Assert.Null(order.Observation);
    }

    [Theory]
    [InlineData("name")]
    [InlineData("phone")]
    [InlineData("zip")]
    [InlineData("street")]
    [InlineData("number")]
    [InlineData("neighborhood")]
    [InlineData("city")]
    public void RequiredFieldsRejectMissingAndWhitespace(string field)
    {
        foreach (var value in new string?[] { null, "", " " })
            Assert.Throws<ArgumentException>(() => Create(
                name: field == "name" ? value : "Cliente Teste",
                phone: field == "phone" ? value : "11999990000",
                zip: field == "zip" ? value : "38400-000",
                street: field == "street" ? value : "Rua",
                number: field == "number" ? value : "10",
                neighborhood: field == "neighborhood" ? value : "Centro",
                city: field == "city" ? value : "Cidade"));
    }

    [Theory]
    [InlineData("name", 120)]
    [InlineData("phone", 25)]
    [InlineData("zip", 10)]
    [InlineData("street", 200)]
    [InlineData("number", 20)]
    [InlineData("neighborhood", 120)]
    [InlineData("city", 120)]
    [InlineData("complement", 200)]
    [InlineData("observation", 2000)]
    public void RejectsOversizedFieldsWithoutEchoingValues(string field, int limit)
    {
        var value = new string('X', limit + 1);
        var error = Assert.Throws<ArgumentException>(() => Create(
            name: field == "name" ? value : "Cliente Teste",
            phone: field == "phone" ? value : "11999990000",
            zip: field == "zip" ? value : "38400-000",
            street: field == "street" ? value : "Rua",
            number: field == "number" ? value : "10",
            neighborhood: field == "neighborhood" ? value : "Centro",
            city: field == "city" ? value : "Cidade",
            complement: field == "complement" ? value : null,
            observation: field == "observation" ? value : null));
        Assert.DoesNotContain(value, error.Message);
    }

    [Fact]
    public void RejectsInvalidTypePhoneAndZip()
    {
        Assert.Throws<ArgumentException>(() => Create("invalid"));
        Assert.Throws<ArgumentException>(() => Create(phone: "not-a-phone"));
        Assert.Throws<ArgumentException>(() => Create(zip: "123"));
    }
}