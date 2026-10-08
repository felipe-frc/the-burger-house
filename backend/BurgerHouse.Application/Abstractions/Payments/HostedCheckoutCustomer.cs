namespace BurgerHouse.Application.Abstractions.Payments;

public sealed record HostedCheckoutCustomer(
    string Name,
    string Email,
    string TaxId,
    string Phone
);
