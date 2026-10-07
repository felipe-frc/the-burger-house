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

    public string OrderType { get; private set; } = string.Empty;
    public string CustomerName { get; private set; } = string.Empty;
    public string CustomerPhone { get; private set; } = string.Empty;
    public string? ZipCode { get; private set; }
    public string? Street { get; private set; }
    public string? HouseNumber { get; private set; }
    public string? Neighborhood { get; private set; }
    public string? City { get; private set; }
    public string? Complement { get; private set; }
    public string? Observation { get; private set; }

    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    private Order() { } // EF Core can materialize historical orders without fulfillment data.

    public Order(decimal deliveryFee, string orderType, string customerName, string customerPhone,
        string? zipCode = null, string? street = null, string? houseNumber = null,
        string? neighborhood = null, string? city = null, string? complement = null,
        string? observation = null)
    {
        if (deliveryFee < 0)
            throw new ArgumentException("Delivery fee cannot be negative.");

        DeliveryFee = deliveryFee;
        OrderType = Required(orderType, 10, nameof(OrderType)).ToLowerInvariant();
        if (OrderType is not ("delivery" or "pickup"))
            throw new ArgumentException("Order type must be 'delivery' or 'pickup'.");
        CustomerName = Required(customerName, 120, nameof(CustomerName));
        CustomerPhone = Required(customerPhone, 25, nameof(CustomerPhone));
        var digits = CustomerPhone.Count(char.IsAsciiDigit);
        if (digits is < 10 or > 15 || CustomerPhone.Any(c => !char.IsAsciiDigit(c) && !" +-()".Contains(c)))
            throw new ArgumentException("Customer phone must contain a valid phone number.");
        ZipCode = Optional(zipCode, 10, nameof(ZipCode));
        Street = Optional(street, 200, nameof(Street));
        HouseNumber = Optional(houseNumber, 20, nameof(HouseNumber));
        Neighborhood = Optional(neighborhood, 120, nameof(Neighborhood));
        City = Optional(city, 120, nameof(City));
        Complement = Optional(complement, 200, nameof(Complement));
        Observation = Optional(observation, 2000, nameof(Observation));
        if (OrderType == "delivery")
        {
            ZipCode = Required(ZipCode, 10, nameof(ZipCode));
            if (!System.Text.RegularExpressions.Regex.IsMatch(ZipCode, @"^[0-9]{5}-?[0-9]{3}$"))
                throw new ArgumentException("Delivery zip code is invalid.");
            Street = Required(Street, 200, nameof(Street));
            HouseNumber = Required(HouseNumber, 20, nameof(HouseNumber));
            Neighborhood = Required(Neighborhood, 120, nameof(Neighborhood));
            City = Required(City, 120, nameof(City));
        }
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

    private static string Required(string? value, int limit, string field) =>
        Optional(value, limit, field) ?? throw new ArgumentException($"{field} is required.");

    private static string? Optional(string? value, int limit, string field)
    {
        var text = value?.Trim();
        if (string.IsNullOrEmpty(text)) return null;
        if (text.Length > limit) throw new ArgumentException($"{field} exceeds the maximum length.");
        return text;
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

    public void AdvanceStatus(OrderStatus next)
    {
        var expected = Status switch
        {
            OrderStatus.Received => OrderStatus.Preparing,
            OrderStatus.Preparing => OrderStatus.ReadyForPickup,
            OrderStatus.ReadyForPickup when OrderType == "delivery" => OrderStatus.OutForDelivery,
            OrderStatus.ReadyForPickup when OrderType == "pickup" => OrderStatus.Completed,
            OrderStatus.OutForDelivery when OrderType == "delivery" => OrderStatus.Completed,
            _ => (OrderStatus?)null
        };
        if (expected != next)
            throw new InvalidOperationException("Invalid operational transition.");
        Status = next;
    }
}
