namespace BurgerHouse.Domain.Entities;

public class Product
{
    public int Id { get; private set; }
    public string Code { get; private set; }
    public string Name { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public string EnglishName { get; private set; } = string.Empty;
    public string EnglishDescription { get; private set; } = string.Empty;
    public decimal Price { get; private set; }
    public decimal? CostPrice { get; private set; }
    public bool IsActive { get; private set; }

    public Product(string code, string name, decimal price)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Trim().Length > 100)
            throw new ArgumentException("Invalid product code.", nameof(code));

        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 150)
            throw new ArgumentException("Invalid product name.", nameof(name));

        if (price <= 0 || price > 99999999.99m ||
            decimal.Round(price, 2) != price)
            throw new ArgumentException("Invalid product price.", nameof(price));

        Code = code.Trim();
        Name = name.Trim();
        Price = price;
        IsActive = true;
    }

    public static Product Create(
        string code,
        string name,
        string description,
        decimal price,
        decimal? cost,
        bool isActive)
    {
        var product = new Product(code, name, price);

        product.UpdateDetails(name, description);
        product.UpdateCost(cost);

        if (!isActive)
            product.Deactivate();

        return product;
    }

    public void UpdateDetails(string name, string description)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException(
                "Product name cannot be empty.",
                nameof(name));

        if (name.Trim().Length > 150)
            throw new ArgumentException(
                "Product name cannot exceed 150 characters.",
                nameof(name));

        if (string.IsNullOrWhiteSpace(description))
            throw new ArgumentException(
                "Product description cannot be empty.",
                nameof(description));

        if (description.Trim().Length > 500)
            throw new ArgumentException(
                "Product description cannot exceed 500 characters.",
                nameof(description));

        Name = name.Trim();
        Description = description.Trim();
    }

    public void UpdateEnglishDetails(string? name, string? description)
    {
        var normalizedName = name?.Trim() ?? string.Empty;
        var normalizedDescription = description?.Trim() ?? string.Empty;

        if (normalizedName.Length > 150)
            throw new ArgumentException(
                "English product name cannot exceed 150 characters.",
                nameof(name));

        if (normalizedDescription.Length > 500)
            throw new ArgumentException(
                "English product description cannot exceed 500 characters.",
                nameof(description));

        if ((normalizedName.Length == 0) != (normalizedDescription.Length == 0))
            throw new ArgumentException(
                "English name and description must both be provided or both be empty.");

        EnglishName = normalizedName;
        EnglishDescription = normalizedDescription;
    }

    public void UpdatePrice(decimal price)
    {
        if (price <= 0 || price > 99999999.99m ||
            decimal.Round(price, 2) != price)
            throw new ArgumentException(
                "Invalid product price.",
                nameof(price));

        Price = price;
    }

    public void UpdateCost(decimal? cost)
    {
        if (cost is < 0 or > 99999999.99m ||
            (cost.HasValue && decimal.Round(cost.Value, 2) != cost))
            throw new ArgumentException(
                "Cost must be a nonnegative monetary value with at most two decimal places.");

        CostPrice = cost;
    }

    public void Activate()
    {
        IsActive = true;
    }

    public void Deactivate()
    {
        IsActive = false;
    }
}