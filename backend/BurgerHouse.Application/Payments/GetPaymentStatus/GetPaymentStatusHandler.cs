using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;

namespace BurgerHouse.Application.Payments.GetPaymentStatus;

public sealed class GetPaymentStatusHandler
{
    private readonly IPaymentRepository
        _paymentRepository;

    private readonly IPaymentReconciliationService
        _paymentReconciliationService;

    public GetPaymentStatusHandler(
        IPaymentRepository paymentRepository,
        IPaymentReconciliationService paymentReconciliationService)
    {
        _paymentRepository =
            paymentRepository;

        _paymentReconciliationService =
            paymentReconciliationService;
    }

    public async Task<GetPaymentStatusResponse>
        HandleAsync(
            int paymentId,
            CancellationToken cancellationToken =
                default)
    {
        if (paymentId <= 0)
        {
            throw new ArgumentException(
                "Payment id must be greater than zero."
            );
        }

        var payment =
            await _paymentRepository
                .GetByIdAsync(
                    paymentId,
                    cancellationToken
                );

        if (payment is null)
        {
            throw new KeyNotFoundException(
                $"Payment '{paymentId}' was not found."
            );
        }

        await _paymentReconciliationService
            .ReconcileAsync(
                paymentId,
                cancellationToken
            );

        payment =
            await _paymentRepository
                .GetByIdAsync(
                    paymentId,
                    cancellationToken
                )
            ?? throw new KeyNotFoundException(
                $"Payment '{paymentId}' was not found."
            );

        return new GetPaymentStatusResponse
        {
            PaymentId =
                payment.Id,

            OrderId =
                payment.OrderId,

            Amount =
                payment.Amount,

            Status =
                payment.Status,

            Method =
                payment.Method,

            CreatedAt =
                payment.CreatedAt,

            UpdatedAt =
                payment.UpdatedAt
        };
    }
}
