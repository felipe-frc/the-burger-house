using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Abstractions.Payments;

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

    public async Task<PreparedCheckoutPayment> HandleAsync(
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
                "Only orders pending payment can start checkout."
            );
        }

        // Historical identity may be absent, but only an existing checkout can be reused.
        var customer =
            string.IsNullOrWhiteSpace(order.CustomerName) ||
            string.IsNullOrWhiteSpace(order.CustomerEmail) ||
            string.IsNullOrWhiteSpace(order.CustomerTaxId)
                ? null
                : new HostedCheckoutCustomer(
                    order.CustomerName,
                    order.CustomerEmail,
                    order.CustomerTaxId,
                    order.CustomerPhone ?? string.Empty
                );

        var activePayment =
            await _paymentRepository.GetActiveByOrderIdAsync(
                order.Id,
                cancellationToken
            );

        if (customer is null && activePayment?.ExternalCheckoutId is null)
        {
            throw new InvalidOperationException(
                "Customer payment identity is incomplete."
            );
        }

        if (activePayment is not null)
        {
            if (activePayment.Status != PaymentStatus.Pending ||
                (activePayment.Method != PaymentMethod.Unknown &&
                 !activePayment.HasHostedCheckout()))
            {
                throw new InvalidOperationException(
                    "This order already has an active payment from another checkout flow."
                );
            }

            return new PreparedCheckoutPayment(activePayment, customer);
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

        return new PreparedCheckoutPayment(payment, customer);
    }
}
