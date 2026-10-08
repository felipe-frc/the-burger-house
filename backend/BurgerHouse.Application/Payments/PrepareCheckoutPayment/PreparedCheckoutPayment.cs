using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Application.Payments.PrepareCheckoutPayment;

public sealed record PreparedCheckoutPayment(
    Payment Payment,
    HostedCheckoutCustomer? Customer
);
