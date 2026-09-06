using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.CreatePayment;

public class CreatePaymentHandler
{
    private readonly IOrderRepository _orderRepository;
    private readonly IPaymentRepository _paymentRepository;

    public CreatePaymentHandler(
        IOrderRepository orderRepository,
        IPaymentRepository paymentRepository)
    {
        _orderRepository = orderRepository;
        _paymentRepository = paymentRepository;
    }

    public async Task<CreatePaymentResponse> HandleAsync(
        CreatePaymentRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.OrderId <= 0)
            throw new ArgumentException(
                "Order id must be greater than zero."
            );

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            throw new ArgumentException(
                "Idempotency key cannot be empty."
            );

        var normalizedKey = request.IdempotencyKey.Trim();

        if (!Guid.TryParseExact(
                normalizedKey,
                "D",
                out var parsedKey))
        {
            throw new ArgumentException(
                "Idempotency key must be a valid UUID."
            );
        }

        normalizedKey = parsedKey.ToString("D");

        var paymentWithSameKey =
            await _paymentRepository.GetByIdempotencyKeyAsync(
                normalizedKey,
                cancellationToken
            );

        if (paymentWithSameKey is not null)
        {
            if (paymentWithSameKey.OrderId != request.OrderId)
            {
                throw new InvalidOperationException(
                    "Idempotency key is already associated with another order."
                );
            }

            return ToResponse(paymentWithSameKey);
        }

        var order = await _orderRepository.GetByIdAsync(
            request.OrderId,
            cancellationToken
        );

        if (order is null)
            throw new KeyNotFoundException(
                $"Order '{request.OrderId}' was not found."
            );

        if (order.Status != OrderStatus.PendingPayment)
            throw new InvalidOperationException(
                "Only orders pending payment can create a payment."
            );

        var activePayment =
            await _paymentRepository.GetActiveByOrderIdAsync(
                order.Id,
                cancellationToken
            );

        if (activePayment is not null)
            throw new InvalidOperationException(
                "An active payment already exists for this order."
            );

        var payment = new Payment(
            order.Id,
            order.Total,
            normalizedKey
        );

        await _paymentRepository.AddAsync(
            payment,
            cancellationToken
        );

        await _paymentRepository.SaveChangesAsync(
            cancellationToken
        );

        return ToResponse(payment);
    }

    private static CreatePaymentResponse ToResponse(
        Payment payment)
    {
        return new CreatePaymentResponse
        {
            PaymentId = payment.Id,
            OrderId = payment.OrderId,
            Amount = payment.Amount,
            Status = payment.Status
        };
    }
}