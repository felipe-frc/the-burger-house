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
    PagBankCheckoutLookup checkoutLookup,
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
            localPayment.Provider != PaymentProvider.PagBank ||
            localPayment.Status != PaymentStatus.Pending ||
            string.IsNullOrWhiteSpace(localPayment.ExternalCheckoutId))
            return;

        var checkoutId = localPayment.ExternalCheckoutId;
        PagBankCheckoutSnapshot? checkout;
        try
        {
            checkout = await checkoutLookup.GetAsync(checkoutId, cancellationToken);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            LogLookupFailure(paymentId, checkoutId, "timeout");
            return;
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or InvalidOperationException)
        {
            LogLookupFailure(paymentId, checkoutId, exception.GetType().Name);
            return;
        }

        if (!TryValidateSnapshot(localPayment, checkout, out var charge, out var reason))
        {
            logger.LogWarning(
                "PagBank reconciliation response rejected. PaymentId: {PaymentId}, ExternalCheckoutId: {ExternalCheckoutId}, ExternalPaymentId: {ExternalPaymentId}, ProviderStatus: {ProviderStatus}, Reason: {Reason}.",
                paymentId,
                checkoutId,
                charge?.Id,
                charge?.ProviderStatus,
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
                    "PagBank reconciliation skipped because the local payment disappeared. PaymentId: {PaymentId}, ExternalCheckoutId: {ExternalCheckoutId}.",
                    paymentId,
                    checkoutId
                );
                return;
            }

            var currentOrder = await dbContext.Orders
                .Include(order => order.Items)
                .SingleOrDefaultAsync(order => order.Id == currentPayment.OrderId, cancellationToken);
            if (currentOrder is null)
            {
                logger.LogWarning(
                    "PagBank reconciliation skipped because the local order was not found. PaymentId: {PaymentId}, ExternalCheckoutId: {ExternalCheckoutId}.",
                    paymentId,
                    checkoutId
                );
                return;
            }

            if (currentPayment.Status != PaymentStatus.Pending)
            {
                logger.LogInformation(
                    "PagBank reconciliation became a no-op after reloading local state. PaymentId: {PaymentId}, ExternalCheckoutId: {ExternalCheckoutId}, LocalStatus: {LocalStatus}.",
                    paymentId,
                    checkoutId,
                    currentPayment.Status
                );
                return;
            }

            if (!IsCurrentStateCompatible(currentPayment, currentOrder, checkout!, charge!, out reason))
            {
                logger.LogWarning(
                    "PagBank reconciliation correlation rejected after reloading local state. PaymentId: {PaymentId}, ExternalCheckoutId: {ExternalCheckoutId}, ExternalPaymentId: {ExternalPaymentId}, Reason: {Reason}.",
                    paymentId,
                    checkoutId,
                    charge!.Id,
                    reason
                );
                return;
            }

            var changed = await synchronizer.HandleAsync(
                paymentId,
                PaymentProvider.PagBank,
                charge!.Id,
                charge.Amount,
                charge.Currency,
                charge.PaymentMethod,
                charge.PaymentStatus,
                cancellationToken
            );
            await transaction.CommitAsync(cancellationToken);

            logger.LogInformation(
                "PagBank payment reconciliation completed. PaymentId: {PaymentId}, ExternalCheckoutId: {ExternalCheckoutId}, ExternalPaymentId: {ExternalPaymentId}, ProviderStatus: {ProviderStatus}, Changed: {Changed}.",
                paymentId,
                checkoutId,
                charge.Id,
                charge.ProviderStatus,
                changed
            );
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            dbContext.ChangeTracker.Clear();
            logger.LogWarning(
                "PagBank reconciliation database operation timed out. PaymentId: {PaymentId}, ExternalCheckoutId: {ExternalCheckoutId}.",
                paymentId,
                checkoutId
            );
        }
        catch (Exception exception) when (exception is InvalidOperationException or DbUpdateException or SqliteException)
        {
            dbContext.ChangeTracker.Clear();
            logger.LogWarning(
                "PagBank reconciliation did not change local state. PaymentId: {PaymentId}, ExternalCheckoutId: {ExternalCheckoutId}, Failure: {Failure}.",
                paymentId,
                checkoutId,
                exception.GetType().Name
            );
        }
    }

    private bool TryValidateSnapshot(
        Payment payment,
        PagBankCheckoutSnapshot? checkout,
        out PagBankPaymentSnapshot? charge,
        out string reason)
    {
        charge = null;
        var reference = PagBankCheckoutService.CreateReference(payment.Id);
        if (checkout is null)
        {
            reason = "checkout-not-found";
            return false;
        }
        if (!string.Equals(checkout.Id, payment.ExternalCheckoutId, StringComparison.Ordinal))
        {
            reason = "checkout-id-mismatch";
            return false;
        }
        if (!string.Equals(checkout.ReferenceId, reference, StringComparison.Ordinal))
        {
            reason = "checkout-reference-mismatch";
            return false;
        }

        var relevantCharges = checkout.Charges
            .Where(candidate => string.Equals(candidate.ReferenceId, reference, StringComparison.Ordinal))
            .ToArray();
        if (relevantCharges.Length != 1)
        {
            reason = "ambiguous-charge";
            return false;
        }

        charge = relevantCharges[0];
        if (!TryGetAmountInCents(payment.Amount, out var expectedAmount) ||
            charge.TotalAmountInCents != expectedAmount ||
            charge.Amount != payment.Amount)
        {
            reason = "amount-mismatch";
            return false;
        }
        if (!string.Equals(charge.Currency, "BRL", StringComparison.Ordinal))
        {
            reason = "currency-mismatch";
            return false;
        }
        if (string.Equals(charge.ProviderStatus, "PAID", StringComparison.OrdinalIgnoreCase) &&
            charge.PaymentMethod == PaymentMethod.Unknown)
        {
            reason = "unknown-paid-method";
            return false;
        }
        if (payment.ExternalPaymentId is not null &&
            !string.Equals(payment.ExternalPaymentId, charge.Id, StringComparison.Ordinal))
        {
            reason = "external-payment-id-mismatch";
            return false;
        }

        reason = string.Empty;
        return true;
    }

    private static bool IsCurrentStateCompatible(
        Payment payment,
        Order order,
        PagBankCheckoutSnapshot checkout,
        PagBankPaymentSnapshot charge,
        out string reason)
    {
        var reference = PagBankCheckoutService.CreateReference(payment.Id);
        if (payment.Provider != PaymentProvider.PagBank ||
            !string.Equals(payment.ExternalCheckoutId, checkout.Id, StringComparison.Ordinal) ||
            !string.Equals(checkout.ReferenceId, reference, StringComparison.Ordinal) ||
            !string.Equals(charge.ReferenceId, reference, StringComparison.Ordinal))
        {
            reason = "provider-or-reference-mismatch";
            return false;
        }
        if (payment.Amount != charge.Amount || order.Total != charge.Amount ||
            !string.Equals(charge.Currency, "BRL", StringComparison.Ordinal))
        {
            reason = "amount-or-currency-mismatch";
            return false;
        }
        if (payment.ExternalPaymentId is not null &&
            !string.Equals(payment.ExternalPaymentId, charge.Id, StringComparison.Ordinal))
        {
            reason = "external-payment-id-mismatch";
            return false;
        }
        if (payment.Method != PaymentMethod.Unknown &&
            charge.PaymentMethod != PaymentMethod.Unknown &&
            payment.Method != charge.PaymentMethod)
        {
            reason = "payment-method-mismatch";
            return false;
        }

        reason = string.Empty;
        return true;
    }

    private void LogLookupFailure(int paymentId, string checkoutId, string failure)
    {
        logger.LogWarning(
            "PagBank checkout lookup failed during reconciliation. PaymentId: {PaymentId}, ExternalCheckoutId: {ExternalCheckoutId}, Failure: {Failure}.",
            paymentId,
            checkoutId,
            failure
        );
    }

    private static bool TryGetAmountInCents(decimal amount, out int cents)
    {
        var value = amount * 100m;
        if (value <= 0 || value != decimal.Truncate(value) || value > int.MaxValue)
        {
            cents = 0;
            return false;
        }

        cents = checked((int)value);
        return true;
    }
}
