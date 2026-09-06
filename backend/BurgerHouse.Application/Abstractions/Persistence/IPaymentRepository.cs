using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Application.Abstractions.Persistence;

public interface IPaymentRepository
{
    Task AddAsync(
        Payment payment,
        CancellationToken cancellationToken = default
    );

    Task<Payment?> GetByIdempotencyKeyAsync(
        string idempotencyKey,
        CancellationToken cancellationToken = default
    );

    Task<Payment?> GetActiveByOrderIdAsync(
        int orderId,
        CancellationToken cancellationToken = default
    );

    Task SaveChangesAsync(
        CancellationToken cancellationToken = default
    );
}