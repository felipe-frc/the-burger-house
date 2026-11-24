using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Application.Abstractions.Persistence;

public interface IProductRepository
{
    Task<Product?> GetByCodeAsync(
        string code,
        CancellationToken cancellationToken = default
    );
    Task<IReadOnlyList<Product>> GetByCodesAsync(
        IReadOnlyCollection<string> codes,
        CancellationToken cancellationToken = default);
}