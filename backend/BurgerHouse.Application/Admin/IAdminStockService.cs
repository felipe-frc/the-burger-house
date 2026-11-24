namespace BurgerHouse.Application.Admin;

public record StockRow(int Id, string Name, string Unit, decimal Quantity, decimal Minimum, int Revision);
public record StockDraft(string Name, string Unit, decimal Minimum);
public record StockMove(Guid RequestId, decimal Delta, string Reason, int Revision);
public record StockHistory(Guid Id, decimal Delta, decimal Balance, string Reason, DateTime CreatedAt);
public interface IAdminStockService
{
    Task<IReadOnlyList<StockRow>> ListAsync(CancellationToken ct);
    Task<StockRow> CreateAsync(StockDraft draft, int actor, CancellationToken ct);
    Task MoveAsync(int id, StockMove move, int actor, CancellationToken ct);
    Task<IReadOnlyList<StockHistory>> HistoryAsync(int id, int page, CancellationToken ct);
}
