using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.SynchronizePaymentStatus;

public sealed class SynchronizePaymentStatusHandler
{
    private readonly IPaymentRepository _paymentRepository;

    public SynchronizePaymentStatusHandler(
        IPaymentRepository paymentRepository)
    {
        _paymentRepository = paymentRepository;
    }

    public async Task<bool> HandleAsync(
        string externalOrderId,
        PaymentGatewayStatus gatewayStatus,
        CancellationToken cancellationToken = default,
        string? externalPaymentId = null)
    {
        if (string.IsNullOrWhiteSpace(externalOrderId))
        {
            throw new ArgumentException(
                "External order id cannot be empty.",
                nameof(externalOrderId)
            );
        }

        var normalizedExternalOrderId =
            externalOrderId.Trim();

        var payment =
            await _paymentRepository.GetByExternalOrderIdAsync(
                normalizedExternalOrderId,
                cancellationToken
            );

        if (payment is null)
        {
            throw new KeyNotFoundException(
                $"Payment with external order id " +
                $"'{normalizedExternalOrderId}' was not found."
            );
        }

        var changed = false;

        if (!string.IsNullOrWhiteSpace(externalPaymentId))
        {
            var previousExternalPaymentId =
                payment.ExternalPaymentId;

            payment.SetExternalPaymentId(
                externalPaymentId
            );

            changed =
                previousExternalPaymentId is null;
        }

        if (gatewayStatus == PaymentGatewayStatus.Pending)
        {
            if (changed)
            {
                await _paymentRepository.SaveChangesAsync(
                    cancellationToken
                );
            }

            return changed;
        }

        var targetStatus = gatewayStatus switch
        {
            PaymentGatewayStatus.Approved =>
                PaymentStatus.Approved,

            PaymentGatewayStatus.Rejected =>
                PaymentStatus.Rejected,

            PaymentGatewayStatus.Cancelled =>
                PaymentStatus.Cancelled,

            PaymentGatewayStatus.Expired =>
                PaymentStatus.Cancelled,

            _ => throw new InvalidOperationException(
                $"Gateway status '{gatewayStatus}' " +
                "cannot be synchronized with the current payment model."
            )
        };

        if (payment.Status == targetStatus)
        {
            if (changed)
            {
                await _paymentRepository.SaveChangesAsync(
                    cancellationToken
                );
            }

            return changed;
        }

        if (payment.Status != PaymentStatus.Pending)
        {
            throw new InvalidOperationException(
                $"Payment in status '{payment.Status}' " +
                $"cannot be changed to '{targetStatus}'."
            );
        }

        switch (targetStatus)
        {
            case PaymentStatus.Approved:
                payment.Approve();
                break;

            case PaymentStatus.Rejected:
                payment.Reject();
                break;

            case PaymentStatus.Cancelled:
                payment.Cancel();
                break;

            default:
                throw new InvalidOperationException(
                    "Unsupported payment status."
                );
        }

        changed = true;

        await _paymentRepository.SaveChangesAsync(
            cancellationToken
        );

        return changed;
    }
}
