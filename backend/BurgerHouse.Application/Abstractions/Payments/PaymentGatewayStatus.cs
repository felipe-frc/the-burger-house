namespace BurgerHouse.Application.Abstractions.Payments;

public enum PaymentGatewayStatus
{
    Pending = 1,
    Approved = 2,
    Rejected = 3,
    Cancelled = 4
}