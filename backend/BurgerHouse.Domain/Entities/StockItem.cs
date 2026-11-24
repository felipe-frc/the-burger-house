namespace BurgerHouse.Domain.Entities;

public sealed class StockItem
{
    public int Id { get; private set; }
    public string Name { get; private set; } = "";
    public string Unit { get; private set; } = "";
    public decimal Quantity { get; private set; }
    public decimal Minimum { get; private set; }
    public int Revision { get; private set; }
    private StockItem() { }
    public StockItem(string name, string unit, decimal minimum)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 120 ||
            string.IsNullOrWhiteSpace(unit) || unit.Trim().Length > 20 || minimum < 0 || minimum > 1000000 || decimal.Round(minimum, 3) != minimum)
            throw new ArgumentException("Invalid stock item.");
        Name = name.Trim(); Unit = unit.Trim(); Minimum = minimum;
    }
    public void Move(decimal delta, int expectedRevision)
    {
        if (Revision != expectedRevision) throw new InvalidOperationException("Stock changed.");
        if (delta is < -1000000 or > 1000000 or 0 || decimal.Round(delta, 3) != delta || Quantity + delta < 0 || Quantity + delta > 1000000)
            throw new ArgumentException("Invalid quantity.");
        Quantity += delta;
        Revision++;
    }
}

public sealed class StockMovement
{
    public Guid Id { get; set; }
    public int StockItemId { get; set; }
    public decimal Delta { get; set; }
    public decimal Balance { get; set; }
    public string Reason { get; set; } = "";
    public int ActorId { get; set; }
    public DateTime CreatedAt { get; set; }
}
