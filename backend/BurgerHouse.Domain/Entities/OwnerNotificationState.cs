namespace BurgerHouse.Domain.Entities;

public sealed class OwnerNotificationState
{
    public int OwnerId { get; set; }
    public int OrderId { get; set; }
    public bool Archived { get; set; }
}
