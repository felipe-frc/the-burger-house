using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PendingPaymentReconciliationBatch(
    BurgerHouseDbContext db,
    IPaymentReconciliationService reconciliation)
{
    public async Task<int> RunAsync(int afterId, CancellationToken cancellationToken)
    {
        var ids = await db.Payments.AsNoTracking()
            .Where(p => p.Id > afterId && p.Status == PaymentStatus.Pending &&
                (p.ExternalCheckoutId != null || p.ExternalPaymentId != null))
            .OrderBy(p => p.Id).Select(p => p.Id).Take(5)
            .ToArrayAsync(cancellationToken);

        foreach (var id in ids)
        {
            // A webhook may have settled the payment since the batch was selected.
            if (await db.Payments.AsNoTracking().AnyAsync(
                p => p.Id == id && p.Status == PaymentStatus.Pending, cancellationToken))
                await reconciliation.ReconcileAsync(id, cancellationToken);
        }

        // Rotate through older pending payments instead of starving newer checkouts.
        return ids.Length == 5 ? ids[^1] : 0;
    }
}
