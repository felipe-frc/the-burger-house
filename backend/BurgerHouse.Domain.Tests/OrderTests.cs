using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Tests;

public class OrderTests
{
    private const string CustomerEmail = "cliente@teste.com";
    private const string CustomerTaxId = "52998224725";

    [Fact]
    public void Constructor_ShouldCreateOrderWithPendingPaymentStatus()
    {
        var order = NewOrder();

        Assert.Equal(8m, order.DeliveryFee);
        Assert.Equal(0m, order.Subtotal);
        Assert.Equal(8m, order.Total);
        Assert.Equal(OrderStatus.PendingPayment, order.Status);
        Assert.Equal(CustomerEmail, order.CustomerEmail);
        Assert.Equal(CustomerTaxId, order.CustomerTaxId);
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenDeliveryFeeIsNegative()
    {
        Assert.Throws<ArgumentException>(
            () => NewOrder(-1m)
        );
    }

    [Fact]
    public void Constructor_ShouldNormalizeFormattedCpf()
    {
        var order = new Order(
            8m,
            "pickup",
            "Cliente Teste",
            "11999990000",
            CustomerEmail,
            "529.982.247-25"
        );

        Assert.Equal(
            "52998224725",
            order.CustomerTaxId
        );
    }

    [Theory]
    [InlineData("11111111111")]
    [InlineData("12345678900")]
    [InlineData("123")]
    [InlineData("abc")]
    public void Constructor_ShouldRejectInvalidCpf(
        string cpf)
    {
        Assert.Throws<ArgumentException>(
            () => new Order(
                8m,
                "pickup",
                "Cliente Teste",
                "11999990000",
                CustomerEmail,
                cpf
            )
        );
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("email-invalido")]
    public void Constructor_ShouldRejectInvalidEmail(
        string email)
    {
        Assert.Throws<ArgumentException>(
            () => new Order(
                8m,
                "pickup",
                "Cliente Teste",
                "11999990000",
                email,
                CustomerTaxId
            )
        );
    }

    [Fact]
    public void AddItem_ShouldAddItemAndUpdateTotals()
    {
        var order = NewOrder();
        var item = new OrderItem(1, 2, 25m);

        order.AddItem(item);

        Assert.Single(order.Items);
        Assert.Equal(50m, order.Subtotal);
        Assert.Equal(58m, order.Total);
    }

    [Fact]
    public void AddItem_ShouldThrow_WhenItemIsNull()
    {
        var order = NewOrder();

        Assert.Throws<ArgumentNullException>(
            () => order.AddItem(null!)
        );
    }

    [Fact]
    public void MarkAsReceived_ShouldChangeStatus_WhenOrderHasItems()
    {
        var order = NewOrder();

        order.AddItem(
            new OrderItem(1, 1, 25m)
        );

        order.MarkAsReceived();

        Assert.Equal(
            OrderStatus.Received,
            order.Status
        );
    }

    [Fact]
    public void MarkAsReceived_ShouldThrow_WhenOrderHasNoItems()
    {
        var order = NewOrder();

        Assert.Throws<InvalidOperationException>(
            () => order.MarkAsReceived()
        );
    }

    [Fact]
    public void AddItem_ShouldThrow_WhenOrderIsAlreadyReceived()
    {
        var order = NewOrder();

        order.AddItem(
            new OrderItem(1, 1, 25m)
        );

        order.MarkAsReceived();

        Assert.Throws<InvalidOperationException>(
            () => order.AddItem(
                new OrderItem(2, 1, 10m)
            )
        );
    }

    private static Order NewOrder(
        decimal deliveryFee = 8m)
    {
        return new Order(
            deliveryFee,
            "pickup",
            "Cliente Teste",
            "11999990000",
            CustomerEmail,
            CustomerTaxId
        );
    }
}