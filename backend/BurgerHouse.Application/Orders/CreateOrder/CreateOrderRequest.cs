namespace BurgerHouse.Application.Orders.CreateOrder;

public static class OrderTypes
{
    public const string Delivery = "delivery";
    public const string Pickup = "pickup";
}

public class CreateOrderRequest
{
    public string OrderType { get; init; } = string.Empty;

    public List<CreateOrderItemRequest> Items { get; init; } = [];
}

public class CreateOrderItemRequest
{
    public string ProductCode { get; init; } = string.Empty;

    public int Quantity { get; init; }

    public string? Observation { get; init; }
}