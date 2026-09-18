using BurgerHouse.Application.Abstractions.Persistence;

using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.PrepareCheckoutPayment;

public sealed class PrepareCheckoutPaymentHandler
{
    private readonly IOrderRepository _orderRepository;

    private readonly IPaymentRepository _paymentRepository;

    public PrepareCheckoutPaymentHandler(
        IOrderRepository orderRepository,
        IPaymentRepository paymentRepository)
    {
        _orderRepository = orderRepository;
        _paymentRepository = paymentRepository;
    }

    public async Task<Payment> HandleAsync(
        int orderId,
        CancellationToken cancellationToken = default)
    {
        if (orderId <= 0)
        {
            throw new ArgumentException(
                "Order id must be greater than zero.",
                nameof(orderId)
            );
        }

        var order =
            await _orderRepository.GetByIdAsync(
                orderId,
                cancellationToken
            );

        if (order is null)
        {
            throw new KeyNotFoundException(
                $"Order '{orderId}' was not found."
            );
        }

        if (order.Status != OrderStatus.PendingPayment)
        {
            throw new InvalidOperationException(
                "Only orders pending payment can start Checkout Pro."
            );
        }

        var activePayment =
            await _paymentRepository.GetActiveByOrderIdAsync(
                order.Id,
                cancellationToken
            );

        if (activePayment is not null)
        {
            if (activePayment.Status != PaymentStatus.Pending ||
                (activePayment.Method != PaymentMethod.Unknown &&
                 activePayment.ExternalPreferenceId is null))
            {
                throw new InvalidOperationException(
                    "This order already has an active payment from another checkout flow."
                );
            }

            return activePayment;
        }

        var payment =
            new Payment(
                order.Id,
                order.Total,
                Guid.NewGuid().ToString("D"),
                PaymentMethod.Unknown
            );

        await _paymentRepository.AddAsync(
            payment,
            cancellationToken
        );

        await _paymentRepository.SaveChangesAsync(
            cancellationToken
        );

        return payment;
    }
}
