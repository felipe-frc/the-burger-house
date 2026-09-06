namespace BurgerHouse.Application.Orders.CreateOrder;

public class CreateOrderRequest
{
    public List<CreateOrderItemRequest> Items { get; init; } = [];
}

public class CreateOrderItemRequest
{
    public string ProductCode { get; init; } = string.Empty;
    public int Quantity { get; init; }
    public string? Observation { get; init; }
}