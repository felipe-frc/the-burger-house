namespace BurgerHouse.Domain.Enums;

public enum OrderStatus
{
    PendingPayment = 1,
    Received = 2,
    Preparing = 3,
    ReadyForPickup = 4,
    OutForDelivery = 5,
    Completed = 6,
    Cancelled = 7
}