namespace BurgerHouse.Domain.Entities;

public class OrderItem
{
    public int Id { get; private set; }
    public int ProductId { get; private set; }
    public int Quantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public string? Observation { get; private set; }

    public decimal Total => UnitPrice * Quantity;

    public OrderItem(
        int productId,
        int quantity,
        decimal unitPrice,
        string? observation = null)
    {
        if (productId <= 0)
            throw new ArgumentException("Product id must be greater than zero.");

        if (quantity <= 0)
            throw new ArgumentException("Quantity must be greater than zero.");

        if (unitPrice < 0)
            throw new ArgumentException("Unit price cannot be negative.");

        ProductId = productId;
        Quantity = quantity;
        UnitPrice = unitPrice;
        Observation = string.IsNullOrWhiteSpace(observation)
            ? null
            : observation.Trim();
    }
}