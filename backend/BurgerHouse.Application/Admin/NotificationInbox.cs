namespace BurgerHouse.Application.Admin;

public record InboxItem(int Id, DateTime ApprovedAt, bool Read, string? Channel = null, string? CustomerName = null, decimal? Amount = null);
public record NotificationInbox(IReadOnlyList<InboxItem> Items, int? BeforeId, int UnreadCount);
public interface INotificationInboxService
{
    Task<NotificationInbox> ListAsync(int ownerId, int? beforeId, CancellationToken ct);
    Task UpdateAsync(int ownerId, int? orderId, bool archived, CancellationToken ct);
}
