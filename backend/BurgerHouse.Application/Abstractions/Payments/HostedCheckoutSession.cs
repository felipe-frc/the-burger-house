namespace BurgerHouse.Application.Abstractions.Payments;

public sealed record HostedCheckoutSession(
    int PaymentId,
    string ExternalCheckoutId,
    string CheckoutUrl
);
