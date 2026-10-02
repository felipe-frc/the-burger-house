namespace BurgerHouse.Application.Abstractions.Payments;

public interface IPaymentReconciliationService
{
    Task ReconcileAsync(
        int paymentId,
        CancellationToken cancellationToken = default);
}
