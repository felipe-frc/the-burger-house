namespace BurgerHouse.Domain.Entities;

public class Product
{
    public int Id { get; private set; }
    public string Code { get; private set; }
    public string Name { get; private set; }
    public decimal Price { get; private set; }
    public decimal? CostPrice { get; private set; }
    public bool IsActive { get; private set; }

    public Product(
        string code,
        string name,
        decimal price)
    {
        if (string.IsNullOrWhiteSpace(code))
            throw new ArgumentException("Product code cannot be empty.");

        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Product name cannot be empty.");

        if (price <= 0)
            throw new ArgumentException("Product price must be greater than zero.");

        Code = code.Trim();
        Name = name.Trim();
        Price = price;
        IsActive = true;
    }

    public void UpdatePrice(decimal price)
    {
        if (price <= 0)
            throw new ArgumentException("Product price must be greater than zero.");

        Price = price;
    }

    public void Activate()
    {
        IsActive = true;
    }

    public void UpdateCost(decimal? cost)
    {
        if (cost is < 0 or > 99999999.99m || (cost.HasValue && decimal.Round(cost.Value, 2) != cost))
            throw new ArgumentException("Cost must be a nonnegative monetary value with at most two decimal places.");
        CostPrice = cost;
    }

    public void Deactivate()
    {
        IsActive = false;
    }
}
