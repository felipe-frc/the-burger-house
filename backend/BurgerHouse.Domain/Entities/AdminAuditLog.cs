namespace BurgerHouse.Domain.Entities;

public sealed class AdminAuditLog
{
    private AdminAuditLog()
    {
    }

    public int Id { get; private set; }

    public int? AdminUserId { get; private set; }

    public string ActorType { get; private set; } = string.Empty;

    public string Action { get; private set; } = string.Empty;

    public string EntityType { get; private set; } = string.Empty;

    public string EntityId { get; private set; } = string.Empty;

    public string Changes { get; private set; } = string.Empty;

    public DateTime CreatedAtUtc { get; private set; }

    public AdminAuditLog(
        int? adminUserId,
        string actorType,
        string action,
        string entityType,
        string entityId,
        string changes,
        DateTime createdAtUtc)
    {
        if (adminUserId <= 0)
            adminUserId = null;

        ActorType = Required(
            actorType,
            nameof(actorType),
            40
        );

        Action = Required(
            action,
            nameof(action),
            100
        );

        EntityType = Required(
            entityType,
            nameof(entityType),
            100
        );

        EntityId = Required(
            entityId,
            nameof(entityId),
            100
        );

        Changes = Required(
            changes,
            nameof(changes),
            8000
        );

        if (createdAtUtc.Kind != DateTimeKind.Utc)
            throw new ArgumentException(
                "Audit timestamp must be UTC.",
                nameof(createdAtUtc)
            );

        AdminUserId = adminUserId;
        CreatedAtUtc = createdAtUtc;
    }

    private static string Required(
        string value,
        string parameterName,
        int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException(
                "Value is required.",
                parameterName
            );

        var trimmed = value.Trim();

        if (trimmed.Length > maxLength)
            throw new ArgumentException(
                $"Value cannot exceed {maxLength} characters.",
                parameterName
            );

        return trimmed;
    }
}