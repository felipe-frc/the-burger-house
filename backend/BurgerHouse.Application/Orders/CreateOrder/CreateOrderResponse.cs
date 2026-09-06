namespace BurgerHouse.Application.Orders.CreateOrder;

public class CreateOrderResponse
{
    public int OrderId { get; init; }
    public decimal Subtotal { get; init; }
    public decimal DeliveryFee { get; init; }
    public decimal Total { get; init; }
}