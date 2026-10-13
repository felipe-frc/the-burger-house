using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Abstractions.Payments;

public interface IPaymentProviderLookup
{
    Task<PaymentProviderSnapshot?> GetAsync(
        string externalPaymentId,
        CancellationToken cancellationToken = default
    );
}

public sealed record PaymentProviderSnapshot(
    string Id,
    string ReferenceId,
    PaymentGatewayStatus PaymentStatus,
    string ProviderStatus,
    PaymentMethod PaymentMethod,
    string? ProviderPaymentMethod,
    decimal Amount,
    string Currency,
    int RefundedAmountInCents
);