using BurgerHouse.Application.Abstractions.Persistence;
using Microsoft.EntityFrameworkCore.Storage;

namespace BurgerHouse.Infrastructure.Persistence;

public sealed class EfUnitOfWork(
    BurgerHouseDbContext dbContext)
    : IUnitOfWork
{
    public async Task<IUnitOfWorkTransaction> BeginTransactionAsync(
        CancellationToken cancellationToken = default)
    {
        var transaction =
            await dbContext.Database.BeginTransactionAsync(
                cancellationToken
            );

        return new EfUnitOfWorkTransaction(
            transaction
        );
    }

    public void ClearTracking()
    {
        dbContext.ChangeTracker.Clear();
    }

    public Task SaveChangesAsync(
        CancellationToken cancellationToken = default)
    {
        return dbContext.SaveChangesAsync(
            cancellationToken
        );
    }

    private sealed class EfUnitOfWorkTransaction(
        IDbContextTransaction transaction)
        : IUnitOfWorkTransaction
    {
        public Task CommitAsync(
            CancellationToken cancellationToken = default)
        {
            return transaction.CommitAsync(
                cancellationToken
            );
        }

        public ValueTask DisposeAsync()
        {
            return transaction.DisposeAsync();
        }
    }
}