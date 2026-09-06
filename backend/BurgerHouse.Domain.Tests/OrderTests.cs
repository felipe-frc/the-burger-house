using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Tests;

public class OrderTests
{
    [Fact]
    public void Constructor_ShouldCreateOrderWithPendingPaymentStatus()
    {
        var order = new Order(8m);

        Assert.Equal(8m, order.DeliveryFee);
        Assert.Equal(0m, order.Subtotal);
        Assert.Equal(8m, order.Total);
        Assert.Equal(OrderStatus.PendingPayment, order.Status);
    }

    [Fact]
    public void Constructor_ShouldThrow_WhenDeliveryFeeIsNegative()
    {
        Assert.Throws<ArgumentException>(() => new Order(-1m));
    }

    [Fact]
    public void AddItem_ShouldAddItemAndUpdateTotals()
    {
        var order = new Order(8m);
        var item = new OrderItem(1, 2, 25m);

        order.AddItem(item);

        Assert.Single(order.Items);
        Assert.Equal(50m, order.Subtotal);
        Assert.Equal(58m, order.Total);
    }

    [Fact]
    public void AddItem_ShouldThrow_WhenItemIsNull()
    {
        var order = new Order(8m);

        Assert.Throws<ArgumentNullException>(() => order.AddItem(null!));
    }

    [Fact]
    public void MarkAsReceived_ShouldChangeStatus_WhenOrderHasItems()
    {
        var order = new Order(8m);
        order.AddItem(new OrderItem(1, 1, 25m));

        order.MarkAsReceived();

        Assert.Equal(OrderStatus.Received, order.Status);
    }

    [Fact]
    public void MarkAsReceived_ShouldThrow_WhenOrderHasNoItems()
    {
        var order = new Order(8m);

        Assert.Throws<InvalidOperationException>(() => order.MarkAsReceived());
    }

    [Fact]
    public void AddItem_ShouldThrow_WhenOrderIsAlreadyReceived()
    {
        var order = new Order(8m);
        order.AddItem(new OrderItem(1, 1, 25m));
        order.MarkAsReceived();

        Assert.Throws<InvalidOperationException>(
            () => order.AddItem(new OrderItem(2, 1, 10m))
        );
    }
}