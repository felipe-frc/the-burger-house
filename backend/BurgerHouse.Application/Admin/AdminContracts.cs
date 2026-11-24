using BurgerHouse.Domain.Enums;
using System.Globalization;

namespace BurgerHouse.Application.Admin;

public record OwnerIdentity(int Id, string Email);
public interface IAdminIdentity
{
    Task<OwnerIdentity?> AuthenticateAsync(string email, string password, CancellationToken ct);
    Task<string> CreateSessionAsync(int ownerId, DateTime expiresAt, CancellationToken ct);
    Task<bool> IsSessionValidAsync(int ownerId, string sessionId, DateTime now, CancellationToken ct);
    Task RevokeSessionAsync(string sessionId, CancellationToken ct);
    Task CreateFirstOwnerAsync(string email, string password, CancellationToken ct);
    Task<bool> ChangePasswordAsync(int ownerId, string currentPassword, string newPassword, CancellationToken ct);
    Task ResetOwnerPasswordAsync(string newPassword, CancellationToken ct, string? email = null);
}
public record Page<T>(IReadOnlyList<T> Items, int Total, int PageNumber, int PageSize = 20);
public record OrderRow(int Id, DateTime CreatedAt, string CustomerName, string OrderType, int ItemCount,
    decimal Total, string Status, string? PaymentMethod, string? PaymentStatus, DateTime? StageStartedAt = null);
public record DispatchChecklist(bool Items, bool Packaging, bool Identification)
{
    public bool IsComplete => Items && Packaging && Identification;
}
public record OperationSchedule(bool Enabled, string? Start = null, string? End = null)
{
    public bool TryGetHours(out TimeOnly start, out TimeOnly end)
    {
        var parsedStart = TimeOnly.TryParseExact(Start, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out start);
        var parsedEnd = TimeOnly.TryParseExact(End, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out end);
        return Enabled && parsedStart && parsedEnd && start != end;
    }
}
public record OperationLimits(int Preparing, int ReadyForPickup, int OutForDelivery,
    OperationSchedule? Schedule = null, int? PendingPaymentAgeHours = null);
public record OperationSettings(int Revision, OperationLimits Limits);
public record CustomerPurchase(int OrderId, DateTime CreatedAt, decimal ApprovedAmount);
public record CustomerSummary(string Name, IReadOnlyList<CustomerPurchase> Purchases, string? Phone = null, string? DeliveryAddress = null);
public record ItemDetail(string Name, int Quantity, decimal UnitPrice, decimal Subtotal, string? Observation, string? Category = null);
public record OperationalOrder(OrderRow Order, string CustomerPhone, string? Street, string? HouseNumber,
    string? Neighborhood, string? City, decimal DeliveryFee, IReadOnlyList<ItemDetail> Items, decimal Discount = 0);
public record PaymentDetail(string Status, string Method, decimal Amount, DateTime UpdatedAt);
public record OrderStageEvent(string Status, DateTime ChangedAt);
public record OrderDetail(OrderRow Order, string CustomerPhone, string? ZipCode, string? Street,
    string? HouseNumber, string? Neighborhood, string? City, string? Complement, string? Observation,
    decimal DeliveryFee, IReadOnlyList<ItemDetail> Items, IReadOnlyList<PaymentDetail> Payments, IReadOnlyList<OrderStageEvent>? StageHistory = null, decimal Discount = 0, string? CouponCode = null);
public record ProductRow(int Id, string Name, string Description, decimal Price, decimal? CostPrice, bool IsActive, string EnglishName = "", string EnglishDescription = "", string Category = "menu", int DisplayOrder = 1000, string? ImageUrl = null, string? Code = null)
{
    public decimal? Margin => CostPrice.HasValue ? Price - CostPrice : null;
}
public record FinanceSummary(decimal GrossRevenue, decimal RefundedAmount, decimal NetRevenue,
    int PaidOrders, decimal AverageTicket, decimal? GrossProfit, int OrdersWithCost, int PartialRefunds,
    int EstimatedApprovals, int UnknownApprovalPayments, int UnreconstructedRefundPayments,
    decimal UndatedRefundBalance);
public record RevenuePoint(string Date, decimal Revenue);
public record OrderMovementHour(DateOnly Date, int Hour, int Count);
public record OrderMovementReport(DateOnly Start, DateOnly End, DateOnly Today,
    IReadOnlyList<OrderMovementHour> Hours, OperationSchedule? Schedule);
public record CategoryRevenueRow(string Category, decimal Revenue);
public record CategoryRevenueReport(IReadOnlyList<CategoryRevenueRow> Categories, decimal UnclassifiedRevenue,
    decimal DeliveryFees, decimal UnallocatedPayments, decimal GrossRevenue, decimal RefundedAmount);
public record MethodSummary(string Method, int Count, decimal Revenue, decimal Percentage);
public record TransactionRow(int OrderId, string CustomerName, DateTime Date, string Method, decimal Amount, string Status,
    DateTime? ApprovedAt, string ApprovalDateSource, decimal RefundedAmount);
public record AuditLogRow(DateTime CreatedAtUtc, string Actor, string Action,
    string EntityType, string EntityId, string Changes);
public record OrderQueueCount(string Status, string Channel, int Count);
public record DashboardShift(bool IsOpen, DateTime Start, DateTime End, FinanceSummary Summary);
public record Dashboard(FinanceSummary Today, FinanceSummary Week, FinanceSummary Month, FinanceSummary Last30Days,
    int OpenOrders, int NewPaidOrders, IReadOnlyList<OrderRow> RecentOrders, IReadOnlyList<OrderQueueCount>? OrderCounts = null,
    DashboardShift? Shift = null);
public record OrderFilter(string? Status = null, string? Search = null, string Sort = "newest", int Page = 1,
    bool ActiveOnly = false, string? Channel = null);
public record NotificationBatch(DateTime Until, int? NextAfterId, int NewPaidOrders, IReadOnlyList<OrderRow> Items);
public record DateRange(DateTime Start, DateTime End, string? Channel = null)
{
    public static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
    public static DateTime LocalToday(DateTime utcNow) => TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc), Zone).Date;
    public static DateRange? ForShift(DateTime utcNow, OperationSchedule? schedule)
    {
        if (schedule is null || !schedule.TryGetHours(out var startHour, out var endHour)) return null;
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcNow, DateTimeKind.Utc), Zone);
        var first = local.Date.Add(startHour.ToTimeSpan());
        if (local < first) first = first.AddDays(-1);
        var last = first.Date.Add(endHour.ToTimeSpan());
        if (last <= first) last = last.AddDays(1);
        return new(TimeZoneInfo.ConvertTimeToUtc(first, Zone), TimeZoneInfo.ConvertTimeToUtc(last, Zone));
    }
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
    Task<OrderMovementReport> OrderMovementAsync(DateOnly start, DateOnly end, DateTime utcNow, string? channel, CancellationToken ct);
    Task<Page<OperationalOrder>> OperationalOrdersAsync(OrderFilter filter, CancellationToken ct);
    Task<OrderDetail?> OrderAsync(int id, CancellationToken ct);
    Task AdvanceAsync(int id, OrderStatus expected, OrderStatus next, int adminUserId, DateTime utcNow, CancellationToken ct, DispatchChecklist? checklist = null);
    Task<OperationSettings> OperationSettingsAsync(CancellationToken ct);
    Task SaveOperationSettingsAsync(OperationSettings settings, int adminUserId, DateTime utcNow, CancellationToken ct);
    Task<IReadOnlyList<CustomerSummary>> CustomersAsync(DateTime since, string? search, CancellationToken ct);
    Task<IReadOnlyList<ProductRow>> ProductsAsync(CancellationToken ct);
    Task<int> CreateProductAsync(string name, string description, decimal price, decimal? cost, bool active, int adminUserId, DateTime utcNow, CancellationToken ct, string? englishName = null, string? englishDescription = null, string category = "menu", int displayOrder = 1000);
    Task UpdateProductAsync(int id, string name, string description, decimal price, decimal? cost, bool active, int adminUserId, DateTime utcNow, CancellationToken ct, string? englishName = null, string? englishDescription = null, string? category = null, int? displayOrder = null);
    Task<FinanceSummary> SummaryAsync(DateRange range, CancellationToken ct);
    Task<IReadOnlyList<RevenuePoint>> RevenueAsync(DateRange range, CancellationToken ct);
    Task<IReadOnlyList<RevenuePoint>> HourlyRevenueAsync(DateRange range, CancellationToken ct);
    Task<CategoryRevenueReport> CategoryRevenueAsync(DateRange range, CancellationToken ct);
    Task<IReadOnlyList<MethodSummary>> MethodsAsync(DateRange range, CancellationToken ct);
    Task<Page<TransactionRow>> TransactionsAsync(DateRange range, int page, CancellationToken ct);
    Task<IReadOnlyList<AuditLogRow>> AuditLogsAsync(DateRange range, CancellationToken ct);
}
