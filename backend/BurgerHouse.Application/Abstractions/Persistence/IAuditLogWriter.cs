using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Application.Abstractions.Persistence;

public interface IAuditLogWriter
{
    Task AddAsync(
        AdminAuditLog auditLog,
        CancellationToken cancellationToken = default
    );
}