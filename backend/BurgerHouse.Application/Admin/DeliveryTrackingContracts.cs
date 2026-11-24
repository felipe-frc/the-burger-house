namespace BurgerHouse.Application.Admin;

public record CourierOption(int Id, string Name);
public record DeliveryTrackingWrite(int CourierId);
public record DeliveryTrackingGrant(int OrderId, string Token, DateTime ExpiresAtUtc);
public record DeliveryTrackingState(int OrderId, string? CourierName, string State, DateTime? LastReportedAtUtc,
    double? Latitude, double? Longitude, double? Accuracy);
public record CourierPositionWrite(double Latitude, double Longitude, double Accuracy, DateTimeOffset FixTime, Guid RunId);
public enum CourierTrackingResult { Accepted, Unauthorized, Ended, TooFast }

public interface IDeliveryTrackingService
{
    Task<IReadOnlyList<CourierOption>> CouriersAsync(CancellationToken ct);
    Task<DeliveryTrackingState> StatusAsync(int orderId, DateTime now, CancellationToken ct);
    Task<DeliveryTrackingGrant> GrantAsync(int orderId, int courierId, int ownerId, DateTime now, CancellationToken ct);
    Task RevokeAsync(int orderId, int ownerId, DateTime now, CancellationToken ct);
    Task<Guid?> StartAsync(int orderId, string token, DateTime now, CancellationToken ct);
    Task<CourierTrackingResult> ReportAsync(int orderId, string token, CourierPositionWrite? position, DateTime now, CancellationToken ct);
    Task PurgeAsync(DateTime now, CancellationToken ct);
}
