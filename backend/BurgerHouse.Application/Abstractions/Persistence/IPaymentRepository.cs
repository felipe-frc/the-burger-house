using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Application.Abstractions.Persistence;

public interface IPaymentRepository
{
    Task AddAsync(
        Payment payment,
        CancellationToken cancellationToken = default
    );

    Task<Payment?> GetByOrderIdAsync(
        int orderId,
        CancellationToken cancellationToken = default
    );

    Task SaveChangesAsync(
        CancellationToken cancellationToken = default
    );
}