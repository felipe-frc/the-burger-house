using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Application.Abstractions.Payments;

public interface IHostedCheckoutGateway
{
    Task<HostedCheckoutSession> GetOrCreateAsync(
        Payment payment,
        CancellationToken cancellationToken = default
    );
}
