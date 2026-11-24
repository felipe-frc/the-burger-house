namespace BurgerHouse.Domain.Entities;

public sealed class AddonOption
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public string ProductCategory { get; set; } = "menu";
    public int MaximumQuantity { get; set; } = 3;
    public bool IsActive { get; set; }
}

public sealed class Coupon
{
    public string Code { get; set; } = "";
    public bool IsActive { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public decimal Percentage { get; set; }
    public decimal FixedAmount { get; set; }
    public decimal MinimumSubtotal { get; set; }
    public string? ProductCategory { get; set; }
    public int UsageLimit { get; set; }
    public int UsedCount { get; set; }
}
