namespace BurgerHouse.Domain.Entities;

public sealed class DeliveryTracking
{
    public int OrderId { get; init; }
    public int CourierId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? LastReportedAtUtc { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? Accuracy { get; set; }
    public bool Sharing { get; set; }
    public Guid? RunId { get; set; }
}
