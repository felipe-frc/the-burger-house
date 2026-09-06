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

        var existingPayment =
            await _paymentRepository.GetByOrderIdAsync(
                order.Id,
                cancellationToken
            );

        if (existingPayment is not null)
            throw new InvalidOperationException(
                "A payment already exists for this order."
            );

        var payment = new Payment(
            order.Id,
            order.Total
        );

        await _paymentRepository.AddAsync(
            payment,
            cancellationToken
        );

        await _paymentRepository.SaveChangesAsync(
            cancellationToken
        );

        return new CreatePaymentResponse
        {
            PaymentId = payment.Id,
            OrderId = payment.OrderId,
            Amount = payment.Amount,
            Status = payment.Status
        };
    }
}