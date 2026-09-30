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
        PaymentProvider provider,
        CancellationToken cancellationToken = default)
    {
        if (orderId <= 0)
        {
            throw new ArgumentException(
                "Order id must be greater than zero.",
                nameof(orderId)
            );
        }

        if (!Enum.IsDefined(provider))
            throw new ArgumentException("Payment provider is invalid.", nameof(provider));

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
                "Only orders pending payment can start checkout."
            );
        }

        var activePayment =
            await _paymentRepository.GetActiveByOrderIdAsync(
                order.Id,
                cancellationToken
            );

        if (activePayment is not null)
        {
            if (activePayment.Provider != provider)
                throw new InvalidOperationException(
                    "This order already has an active payment from another provider."
                );

            if (activePayment.Status != PaymentStatus.Pending ||
                (activePayment.Method != PaymentMethod.Unknown &&
                 !activePayment.HasHostedCheckout()))
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
                PaymentMethod.Unknown,
                provider
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

    public Task<Payment> HandleAsync(
        int orderId,
        CancellationToken cancellationToken = default) =>
        HandleAsync(orderId, PaymentProvider.MercadoPago, cancellationToken);
}
