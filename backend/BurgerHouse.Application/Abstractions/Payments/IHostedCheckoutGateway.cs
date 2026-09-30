using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Abstractions.Payments;

public interface IHostedCheckoutGateway
{
    PaymentProvider Provider { get; }

    Task<HostedCheckoutSession> GetOrCreateAsync(
        Payment payment,
        CancellationToken cancellationToken = default
    );
}
