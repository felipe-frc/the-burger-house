using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;

using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Repositories;

public class PaymentRepository : IPaymentRepository
{
    private readonly BurgerHouseDbContext _dbContext;

    public PaymentRepository(BurgerHouseDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task AddAsync(
        Payment payment,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(payment);

        await _dbContext.Payments.AddAsync(
            payment,
            cancellationToken
        );
    }

    public async Task<Payment?> GetByIdAsync(
        int paymentId,
        CancellationToken cancellationToken = default)
    {
        if (paymentId <= 0)
            return null;

        return await _dbContext.Payments
            .FirstOrDefaultAsync(
                payment => payment.Id == paymentId,
                cancellationToken
            );
    }

    public async Task<Payment?> GetByExternalOrderIdAsync(
        string externalOrderId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(externalOrderId))
            return null;

        var normalizedExternalOrderId =
            externalOrderId.Trim();

        return await _dbContext.Payments
            .FirstOrDefaultAsync(
                payment =>
                    payment.ExternalOrderId ==
                    normalizedExternalOrderId,
                cancellationToken
            );
    }

    public async Task<Payment?> GetByIdempotencyKeyAsync(
        string idempotencyKey,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey))
            return null;

        var normalizedKey = idempotencyKey.Trim();

        return await _dbContext.Payments
            .FirstOrDefaultAsync(
                payment =>
                    payment.IdempotencyKey == normalizedKey,
                cancellationToken
            );
    }

    public async Task<Payment?> GetActiveByOrderIdAsync(
        int orderId,
        CancellationToken cancellationToken = default)
    {
        if (orderId <= 0)
            return null;

        return await _dbContext.Payments
            .FirstOrDefaultAsync(
                payment =>
                    payment.OrderId == orderId &&
                    (
                        payment.Status == PaymentStatus.Pending ||
                        payment.Status == PaymentStatus.Approved
                    ),
                cancellationToken
            );
    }

    public async Task SaveChangesAsync(
        CancellationToken cancellationToken = default)
    {
        await _dbContext.SaveChangesAsync(
            cancellationToken
        );
    }
}