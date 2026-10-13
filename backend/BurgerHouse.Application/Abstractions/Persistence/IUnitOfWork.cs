namespace BurgerHouse.Application.Abstractions.Persistence;

public interface IUnitOfWork
{
    Task<IUnitOfWorkTransaction> BeginTransactionAsync(
        CancellationToken cancellationToken = default
    );

    void ClearTracking();

    Task SaveChangesAsync(
        CancellationToken cancellationToken = default
    );
}

public interface IUnitOfWorkTransaction : IAsyncDisposable
{
    Task CommitAsync(
        CancellationToken cancellationToken = default
    );
}