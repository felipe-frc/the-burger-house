namespace BurgerHouse.Application.Orders.CreateOrder;

public static class OrderTypes
{
    public const string Delivery = "delivery";
    public const string Pickup = "pickup";
}

public class CreateOrderRequest
{
    public string OrderType { get; init; } = string.Empty;

    public string CustomerName { get; init; } = string.Empty;

    public string CustomerPhone { get; init; } = string.Empty;

    public string CustomerEmail { get; init; } = string.Empty;

    public string CustomerTaxId { get; init; } = string.Empty;

    public string? ZipCode { get; init; }

    public string? Street { get; init; }

    public string? HouseNumber { get; init; }

    public string? Neighborhood { get; init; }

    public string? City { get; init; }

    public string? Complement { get; init; }

    public string? Observation { get; init; }

    public List<CreateOrderItemRequest> Items { get; init; } = [];
}

public class CreateOrderItemRequest
{
    public string ProductCode { get; init; } = string.Empty;

    public int Quantity { get; init; }

    public string? Observation { get; init; }
}