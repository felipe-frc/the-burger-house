using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PendingPaymentExpirationBatch(
    BurgerHouseDbContext db,
    PagBankPaymentLookup paymentLookup,
    IOptions<PagBankOptions> options,
    ILogger<PendingPaymentExpirationBatch> logger)
{
    private readonly TimeSpan _expiration =
        TimeSpan.FromMinutes(
            options.Value.CheckoutExpirationMinutes
        );

    public async Task<int> RunAsync(
        CancellationToken cancellationToken = default)
    {
        if (_expiration <= TimeSpan.Zero)
        {
            throw new InvalidOperationException(
                "Pending payment expiration must be greater than zero."
            );
        }

        var cutoff =
            DateTime.UtcNow - _expiration;

        var orderIds =
            await db.Orders
                .AsNoTracking()
                .Where(order =>
                    order.Status == OrderStatus.PendingPayment &&
                    order.CreatedAt <= cutoff
                )
                .OrderBy(order => order.Id)
                .Select(order => order.Id)
                .Take(20)
                .ToArrayAsync(cancellationToken);

        var expiredCount = 0;

        foreach (var orderId in orderIds)
        {
            if (await TryExpireAsync(
                    orderId,
                    cutoff,
                    cancellationToken
                ))
            {
                expiredCount++;
            }
        }

        return expiredCount;
    }

    private async Task<bool> TryExpireAsync(
        int orderId,
        DateTime cutoff,
        CancellationToken cancellationToken)
    {
        db.ChangeTracker.Clear();

        var payment =
            await GetActivePaymentAsync(
                orderId,
                cancellationToken
            );

        if (payment?.Status == PaymentStatus.Approved)
        {
            return false;
        }

        if (payment is not null &&
            payment.ExternalCheckoutId is null)
        {
            if (payment.ExternalPaymentId is not null ||
                payment.CreatedAt > cutoff)
            {
                return false;
            }
        }

        var expectedPaymentId =
            payment?.Id;

        var expectedCheckoutId =
            payment?.ExternalCheckoutId;

        var expectedExternalPaymentId =
            payment?.ExternalPaymentId;

        if (payment?.ExternalCheckoutId is not null)
        {
            string? checkoutStatus;

            try
            {
                checkoutStatus =
                    await paymentLookup.GetCheckoutStatusAsync(
                        payment.ExternalCheckoutId,
                        payment.Id,
                        cancellationToken
                    );
            }
            catch (OperationCanceledException)
                when (!cancellationToken.IsCancellationRequested)
            {
                logger.LogWarning(
                    "Pending payment expiration lookup timed out. PaymentId: {PaymentId}.",
                    payment.Id
                );

                return false;
            }
            catch (Exception exception)
                when (exception is HttpRequestException
                    or InvalidOperationException
                    or System.Text.Json.JsonException)
            {
                logger.LogWarning(
                    "Pending payment expiration lookup failed. PaymentId: {PaymentId}, Failure: {Failure}.",
                    payment.Id,
                    exception.GetType().Name
                );

                return false;
            }

            if (!string.Equals(
                    checkoutStatus,
                    "EXPIRED",
                    StringComparison.OrdinalIgnoreCase
                ))
            {
                return false;
            }
        }

        db.ChangeTracker.Clear();

        await using var transaction =
            await db.Database.BeginTransactionAsync(
                cancellationToken
            );

        var order =
            await db.Orders
                .SingleOrDefaultAsync(
                    item => item.Id == orderId,
                    cancellationToken
                );

        if (order is null ||
            order.Status != OrderStatus.PendingPayment ||
            order.CreatedAt > cutoff)
        {
            return false;
        }

        var currentPayment =
            await GetActivePaymentAsync(
                orderId,
                cancellationToken
            );

        if (currentPayment?.Id != expectedPaymentId)
        {
            return false;
        }

        if (currentPayment?.Status == PaymentStatus.Approved)
        {
            return false;
        }

        if (!string.Equals(
                currentPayment?.ExternalCheckoutId,
                expectedCheckoutId,
                StringComparison.Ordinal
            ) ||
            !string.Equals(
                currentPayment?.ExternalPaymentId,
                expectedExternalPaymentId,
                StringComparison.Ordinal
            ))
        {
            return false;
        }

        if (currentPayment is not null &&
            currentPayment.ExternalCheckoutId is null &&
            (
                currentPayment.ExternalPaymentId is not null ||
                currentPayment.CreatedAt > cutoff
            ))
        {
            return false;
        }

        order.CancelPendingPayment();

        if (currentPayment is not null)
        {
            currentPayment.Cancel();
        }

        await db.SaveChangesAsync(
            cancellationToken
        );

        await transaction.CommitAsync(
            cancellationToken
        );

        logger.LogInformation(
            "Expired pending payment order. OrderId: {OrderId}, PaymentId: {PaymentId}.",
            order.Id,
            currentPayment?.Id
        );

        return true;
    }

    private Task<Payment?> GetActivePaymentAsync(
        int orderId,
        CancellationToken cancellationToken)
    {
        return db.Payments
            .SingleOrDefaultAsync(
                payment =>
                    payment.OrderId == orderId &&
                    (
                        payment.Status == PaymentStatus.Pending ||
                        payment.Status == PaymentStatus.Approved
                    ),
                cancellationToken
            );
    }
}