using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Domain.Entities;

public class Order
{
    private readonly List<OrderItem> _items = [];

    public int Id { get; private set; }
    public decimal DeliveryFee { get; private set; }
    public decimal Subtotal => _items.Sum(item => item.Total);
    public decimal Total => Subtotal + DeliveryFee;
    public OrderStatus Status { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    public Order(decimal deliveryFee)
    {
        if (deliveryFee < 0)
            throw new ArgumentException("Delivery fee cannot be negative.");

        DeliveryFee = deliveryFee;
        Status = OrderStatus.PendingPayment;
        CreatedAt = DateTime.UtcNow;
    }

    public void AddItem(OrderItem item)
    {
        ArgumentNullException.ThrowIfNull(item);

        if (Status != OrderStatus.PendingPayment)
            throw new InvalidOperationException(
                "Items cannot be added after the payment is confirmed."
            );

        _items.Add(item);
    }

    public void MarkAsReceived()
    {
        if (Status != OrderStatus.PendingPayment)
            throw new InvalidOperationException(
                "Only orders pending payment can be marked as received."
            );

        if (_items.Count == 0)
            throw new InvalidOperationException(
                "An order without items cannot be received."
            );

        Status = OrderStatus.Received;
    }
}