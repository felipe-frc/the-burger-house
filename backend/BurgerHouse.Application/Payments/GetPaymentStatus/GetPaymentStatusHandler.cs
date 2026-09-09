using BurgerHouse.Application.Abstractions.Persistence;

namespace BurgerHouse.Application.Payments.GetPaymentStatus;

public sealed class GetPaymentStatusHandler
{
    private readonly IPaymentRepository
        _paymentRepository;

    public GetPaymentStatusHandler(
        IPaymentRepository paymentRepository)
    {
        _paymentRepository =
            paymentRepository;
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