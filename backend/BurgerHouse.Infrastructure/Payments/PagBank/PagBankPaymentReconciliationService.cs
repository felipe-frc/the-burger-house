using System.Text.Json;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PagBankPaymentReconciliationService(
    PagBankPaymentLookup paymentLookup,
    SynchronizeCheckoutPaymentHandler synchronizer,
    BurgerHouseDbContext dbContext,
    ILogger<PagBankPaymentReconciliationService> logger) : IPaymentReconciliationService
{
    public async Task ReconcileAsync(
        int paymentId,
        CancellationToken cancellationToken = default)
    {
        var localPayment = await dbContext.Payments
            .AsNoTracking()
            .SingleOrDefaultAsync(payment => payment.Id == paymentId, cancellationToken);

        if (localPayment is null ||
            !ShouldReconcile(localPayment) ||
            (string.IsNullOrWhiteSpace(localPayment.ExternalPaymentId) &&
             string.IsNullOrWhiteSpace(localPayment.ExternalCheckoutId)))
            return;

        var externalPaymentId = localPayment.ExternalPaymentId;
        PagBankPaymentSnapshot? snapshot;
        try
        {
            if (string.IsNullOrWhiteSpace(externalPaymentId))
            {
                logger.LogInformation("PagBank checkout fallback started. PaymentId: {PaymentId}.", paymentId);
                var order = await dbContext.Orders.AsNoTracking().Include(o => o.Items)
                    .SingleOrDefaultAsync(o => o.Id == localPayment.OrderId, cancellationToken);
                if (order is null || order.Total != localPayment.Amount)
                {
                    logger.LogWarning("PagBank checkout fallback rejected local order amount. PaymentId: {PaymentId}.", paymentId);
                    return;
                }
                var discovery = await paymentLookup.DiscoverChargeAsync(
                    localPayment.ExternalCheckoutId!, paymentId, localPayment.Amount, cancellationToken);
                logger.LogInformation(
                    "PagBank checkout fallback result. PaymentId: {PaymentId}, CheckoutFound: {CheckoutFound}, Candidates: {Candidates}, Reason: {Reason}.",
                    paymentId, discovery.CheckoutFound, discovery.Candidates, discovery.Reason);
                if (discovery.ChargeId is null)
                {
                    logger.LogWarning("PagBank checkout fallback rejected selection. PaymentId: {PaymentId}, Reason: {Reason}.", paymentId, discovery.Reason);
                    return;
                }
                externalPaymentId = discovery.ChargeId;
            }
            logger.LogInformation("PagBank canonical charge lookup started. PaymentId: {PaymentId}.", paymentId);
            snapshot = await paymentLookup.GetAsync(externalPaymentId, cancellationToken);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            LogLookupFailure(paymentId, externalPaymentId, "timeout");
            return;
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or InvalidOperationException)
        {
            LogLookupFailure(paymentId, externalPaymentId, exception.GetType().Name);
            return;
        }

        if (!IsSnapshotCompatible(localPayment, externalPaymentId!, snapshot, out var reason))
        {
            logger.LogWarning(
                "PagBank charge reconciliation response rejected. PaymentId: {PaymentId}, ExternalPaymentId: {ExternalPaymentId}, ProviderStatus: {ProviderStatus}, Reason: {Reason}.",
                paymentId,
                externalPaymentId,
                snapshot?.ProviderStatus,
                reason
            );
            return;
        }

        try
        {
            dbContext.ChangeTracker.Clear();
            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

            var currentPayment = await dbContext.Payments
                .SingleOrDefaultAsync(payment => payment.Id == paymentId, cancellationToken);
            if (currentPayment is null)
            {
                logger.LogWarning(
                    "PagBank charge reconciliation skipped because the local payment disappeared. PaymentId: {PaymentId}, ExternalPaymentId: {ExternalPaymentId}.",
                    paymentId,
                    externalPaymentId
                );
                return;
            }

            var currentOrder = await dbContext.Orders
                .Include(order => order.Items)
                .SingleOrDefaultAsync(order => order.Id == currentPayment.OrderId, cancellationToken);
            if (currentOrder is null)
            {
                logger.LogWarning(
                    "PagBank charge reconciliation skipped because the local order was not found. PaymentId: {PaymentId}, ExternalPaymentId: {ExternalPaymentId}.",
                    paymentId,
                    externalPaymentId
                );
                return;
            }

            if (!ShouldReconcile(currentPayment))
            {
                logger.LogInformation(
                    "PagBank charge reconciliation became a no-op after reloading local state. PaymentId: {PaymentId}, ExternalPaymentId: {ExternalPaymentId}, LocalStatus: {LocalStatus}.",
                    paymentId,
                    externalPaymentId,
                    currentPayment.Status
                );
                return;
            }

            if (!IsCurrentStateCompatible(currentPayment, currentOrder, localPayment.ExternalCheckoutId, snapshot!, out reason))
            {
                logger.LogWarning(
                    "PagBank charge reconciliation correlation rejected after reloading local state. PaymentId: {PaymentId}, ExternalPaymentId: {ExternalPaymentId}, Reason: {Reason}.",
                    paymentId,
                    externalPaymentId,
                    reason
                );
                return;
            }

            var changed = await synchronizer.HandleAsync(
                paymentId,
                snapshot!.Id,
                snapshot.Amount,
                snapshot.Currency,
                snapshot.PaymentMethod,
                snapshot.PaymentStatus,
                cancellationToken,
                refundedAmount: snapshot.RefundedAmountInCents / 100m
            );
            await transaction.CommitAsync(cancellationToken);

            logger.LogInformation(
                "PagBank charge reconciliation completed. PaymentId: {PaymentId}, ExternalPaymentId: {ExternalPaymentId}, ProviderStatus: {ProviderStatus}, Changed: {Changed}.",
                paymentId,
                snapshot.Id,
                snapshot.ProviderStatus,
                changed
            );
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            dbContext.ChangeTracker.Clear();
            logger.LogWarning(
                "PagBank charge reconciliation database operation timed out. PaymentId: {PaymentId}, ExternalPaymentId: {ExternalPaymentId}.",
                paymentId,
                externalPaymentId
            );
        }
        catch (Exception exception) when (exception is InvalidOperationException or DbUpdateException or SqliteException)
        {
            dbContext.ChangeTracker.Clear();
            logger.LogWarning(
                "PagBank charge reconciliation did not change local state. PaymentId: {PaymentId}, ExternalPaymentId: {ExternalPaymentId}, Failure: {Failure}.",
                paymentId,
                externalPaymentId,
                exception.GetType().Name
            );
        }
    }

    private static bool IsSnapshotCompatible(
        Payment payment,
        string expectedChargeId,
        PagBankPaymentSnapshot? snapshot,
        out string reason)
    {
        if (snapshot is null)
        {
            reason = "charge-not-found";
            return false;
        }
        if (!string.Equals(snapshot.Id, expectedChargeId, StringComparison.Ordinal))
        {
            reason = "charge-id-mismatch";
            return false;
        }
        if (!string.Equals(
                snapshot.ReferenceId,
                PagBankCheckoutService.CreateReference(payment.Id),
                StringComparison.Ordinal))
        {
            reason = "charge-reference-mismatch";
            return false;
        }
        if (snapshot.Amount != payment.Amount || !string.Equals(snapshot.Currency, "BRL", StringComparison.Ordinal))
        {
            reason = "amount-or-currency-mismatch";
            return false;
        }
        if (string.Equals(snapshot.ProviderStatus, "PAID", StringComparison.OrdinalIgnoreCase) &&
            snapshot.PaymentMethod == PaymentMethod.Unknown)
        {
            reason = "unknown-paid-method";
            return false;
        }

        reason = string.Empty;
        return true;
    }

    private static bool IsCurrentStateCompatible(
        Payment payment,
        Order order,
        string? expectedCheckoutId,
        PagBankPaymentSnapshot snapshot,
        out string reason)
    {
        if (string.IsNullOrWhiteSpace(payment.ExternalCheckoutId) ||
            !string.Equals(payment.ExternalCheckoutId, expectedCheckoutId, StringComparison.Ordinal) ||
            (payment.ExternalPaymentId is not null &&
             !string.Equals(payment.ExternalPaymentId, snapshot.Id, StringComparison.Ordinal)) ||
            !string.Equals(
                snapshot.ReferenceId,
                PagBankCheckoutService.CreateReference(payment.Id),
                StringComparison.Ordinal))
        {
            reason = "checkout-or-charge-correlation-mismatch";
            return false;
        }
        if (payment.Amount != snapshot.Amount || order.Total != snapshot.Amount ||
            !string.Equals(snapshot.Currency, "BRL", StringComparison.Ordinal))
        {
            reason = "amount-or-currency-mismatch";
            return false;
        }

        reason = string.Empty;
        return true;
    }

    private void LogLookupFailure(int paymentId, string? externalPaymentId, string failure)
    {
        logger.LogWarning(
            "PagBank charge lookup failed during reconciliation. PaymentId: {PaymentId}, ExternalPaymentId: {ExternalPaymentId}, Failure: {Failure}.",
            paymentId,
            externalPaymentId,
            failure
        );
    }

    private static bool ShouldReconcile(Payment payment) =>
        payment.Status is PaymentStatus.Pending or PaymentStatus.Approved or PaymentStatus.PartiallyRefunded ||
        payment.Status == PaymentStatus.Refunded && payment.RefundTrackingStartedAt is null;
}
