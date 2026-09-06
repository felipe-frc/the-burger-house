using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Entities;
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

    public async Task<Payment?> GetByOrderIdAsync(
        int orderId,
        CancellationToken cancellationToken = default)
    {
        if (orderId <= 0)
            return null;

        return await _dbContext.Payments
            .FirstOrDefaultAsync(
                payment => payment.OrderId == orderId,
                cancellationToken
            );
    }

    public async Task SaveChangesAsync(
        CancellationToken cancellationToken = default)
    {
        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}