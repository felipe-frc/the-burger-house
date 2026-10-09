using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Admin;

public record OwnerIdentity(int Id, string Email);
public interface IAdminIdentity
{
    Task<OwnerIdentity?> AuthenticateAsync(string email, string password, CancellationToken ct);
    Task<string> CreateSessionAsync(int ownerId, DateTime expiresAt, CancellationToken ct);
    Task<bool> IsSessionValidAsync(int ownerId, string sessionId, DateTime now, CancellationToken ct);
    Task RevokeSessionAsync(string sessionId, CancellationToken ct);
    Task CreateFirstOwnerAsync(string email, string password, CancellationToken ct);
}
public record Page<T>(IReadOnlyList<T> Items, int Total, int PageNumber, int PageSize = 20);
public record OrderRow(int Id, DateTime CreatedAt, string CustomerName, string OrderType, int ItemCount,
    decimal Total, string Status, string? PaymentMethod, string? PaymentStatus);
public record ItemDetail(string Name, int Quantity, decimal UnitPrice, decimal Subtotal, string? Observation);
public record PaymentDetail(string Status, string Method, decimal Amount, DateTime UpdatedAt);
public record OrderDetail(OrderRow Order, string CustomerPhone, string? ZipCode, string? Street,
    string? HouseNumber, string? Neighborhood, string? City, string? Complement, string? Observation,
    decimal DeliveryFee, IReadOnlyList<ItemDetail> Items, IReadOnlyList<PaymentDetail> Payments);
public record ProductRow(int Id, string Name, decimal Price, decimal? CostPrice, bool IsActive)
{
    public decimal? Margin => CostPrice.HasValue ? Price - CostPrice : null;
}
public record FinanceSummary(decimal GrossRevenue, decimal RefundedAmount, decimal NetRevenue,
    int PaidOrders, decimal AverageTicket, decimal? GrossProfit, int OrdersWithCost, int PartialRefunds,
    int EstimatedApprovals, int UnknownApprovalPayments, int UnreconstructedRefundPayments,
    decimal UndatedRefundBalance);
public record RevenuePoint(string Date, decimal Revenue);
public record MethodSummary(string Method, int Count, decimal Revenue, decimal Percentage);
public record TransactionRow(int OrderId, string CustomerName, DateTime Date, string Method, decimal Amount, string Status,
    DateTime? ApprovedAt, string ApprovalDateSource, decimal RefundedAmount);
public record Dashboard(FinanceSummary Today, FinanceSummary Week, FinanceSummary Month, FinanceSummary Last30Days,
    int OpenOrders, int NewPaidOrders, IReadOnlyList<OrderRow> RecentOrders);
public record OrderFilter(string? Status = null, string? Search = null, string Sort = "newest", int Page = 1);
public record NotificationBatch(DateTime Until, int? NextAfterId, int NewPaidOrders, IReadOnlyList<OrderRow> Items);
public record DateRange(DateTime Start, DateTime End)
{
    public static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
    public static DateTime LocalToday(DateTime utcNow) => TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc), Zone).Date;
    public static DateRange FromDates(DateTime start, DateTime end)
    {
        if (end < start || (end - start).TotalDays > 366) throw new ArgumentException("Invalid period.");
        return new(TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(start.Date, DateTimeKind.Unspecified), Zone),
            TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(end.Date.AddDays(1), DateTimeKind.Unspecified), Zone));
    }
}
public interface IAdminService
{
    Task<Dashboard> DashboardAsync(DateTime utcNow, CancellationToken ct);
    Task<NotificationBatch> NotificationsAsync(DateTime? since, DateTime until, int afterId, CancellationToken ct);
    Task<Page<OrderRow>> OrdersAsync(OrderFilter filter, CancellationToken ct);
    Task<OrderDetail?> OrderAsync(int id, CancellationToken ct);
    Task AdvanceAsync(int id, OrderStatus expected, OrderStatus next, CancellationToken ct);
    Task<IReadOnlyList<ProductRow>> ProductsAsync(CancellationToken ct);
    Task UpdateProductAsync(int id, decimal price, decimal? cost, bool active, CancellationToken ct);
    Task<FinanceSummary> SummaryAsync(DateRange range, CancellationToken ct);
    Task<IReadOnlyList<RevenuePoint>> RevenueAsync(DateRange range, CancellationToken ct);
    Task<IReadOnlyList<MethodSummary>> MethodsAsync(DateRange range, CancellationToken ct);
    Task<Page<TransactionRow>> TransactionsAsync(DateRange range, int page, CancellationToken ct);
}
