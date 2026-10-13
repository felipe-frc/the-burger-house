using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Infrastructure.Persistence;

public sealed class EfAuditLogWriter(
    BurgerHouseDbContext dbContext)
    : IAuditLogWriter
{
    public async Task AddAsync(
        AdminAuditLog auditLog,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(
            auditLog
        );

        await dbContext.AdminAuditLogs.AddAsync(
            auditLog,
            cancellationToken
        );
    }
}