namespace BurgerHouse.Domain.Entities;

public class OrderItem
{
    public int Id { get; private set; }
    public int ProductId { get; private set; }
    public int Quantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal? UnitCost { get; private set; }
    public string? SaleCategory { get; private set; }
    public string? Observation { get; private set; }
    public string? ExtrasJson { get; private set; }
    public void SetExtrasSnapshot(string snapshot) => ExtrasJson = snapshot;
    internal void MinimizePrivacyNotes() => Observation = null;
    public decimal DiscountAmount { get; private set; }
    public void SetDiscount(decimal amount)
    {
        if (amount < 0 || amount > Total) throw new ArgumentException("Invalid line discount.");
        DiscountAmount = amount;
    }

    public decimal Total => UnitPrice * Quantity;

    public OrderItem(
        int productId,
        int quantity,
        decimal unitPrice,
        string? observation = null,
        decimal? unitCost = null,
        string? saleCategory = null)
    {
        if (productId <= 0)
            throw new ArgumentException("Product id must be greater than zero.");

        if (quantity <= 0)
            throw new ArgumentException("Quantity must be greater than zero.");

        if (quantity > 99)
            throw new ArgumentException("Quantity cannot exceed 99.");

        if (unitPrice < 0)
            throw new ArgumentException("Unit price cannot be negative.");

        ProductId = productId;
        Quantity = quantity;
        UnitPrice = unitPrice;
        if (unitCost is < 0 or > 99999999.99m || (unitCost.HasValue && decimal.Round(unitCost.Value, 2) != unitCost))
            throw new ArgumentException("Unit cost must be a nonnegative monetary value.");
        UnitCost = unitCost;
        if (saleCategory is not null && !Product.IsValidCategory(saleCategory))
            throw new ArgumentException("Invalid product category.", nameof(saleCategory));
        SaleCategory = saleCategory;
        var trimmedObservation = string.IsNullOrWhiteSpace(observation)
            ? null
            : observation.Trim();
        if (trimmedObservation is { Length: > 500 })
            throw new ArgumentException("Observation cannot exceed 500 characters.");
        Observation = trimmedObservation;
    }
}
