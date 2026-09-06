using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.CreatePayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using System.Reflection;

namespace BurgerHouse.Application.Tests;

public class CreatePaymentHandlerTests
{
    [Fact]
    public async Task HandleAsync_ShouldCreatePaymentUsingOrderTotal()
    {
        var order = CreateOrder(
            id: 1,
            quantity: 2,
            unitPrice: 43.90m
        );

        var orderRepository = new FakeOrderRepository(order);
        var paymentRepository = new FakePaymentRepository();

        var handler = new CreatePaymentHandler(
            orderRepository,
            paymentRepository
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 1
        };

        var response = await handler.HandleAsync(request);

        Assert.Equal(200, response.PaymentId);
        Assert.Equal(1, response.OrderId);
        Assert.Equal(87.80m, response.Amount);
        Assert.Equal(PaymentStatus.Pending, response.Status);

        Assert.NotNull(paymentRepository.AddedPayment);
        Assert.Equal(87.80m, paymentRepository.AddedPayment.Amount);
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenOrderIdIsInvalid()
    {
        var orderRepository = new FakeOrderRepository();
        var paymentRepository = new FakePaymentRepository();

        var handler = new CreatePaymentHandler(
            orderRepository,
            paymentRepository
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 0
        };

        await Assert.ThrowsAsync<ArgumentException>(
            () => handler.HandleAsync(request)
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenOrderDoesNotExist()
    {
        var orderRepository = new FakeOrderRepository();
        var paymentRepository = new FakePaymentRepository();

        var handler = new CreatePaymentHandler(
            orderRepository,
            paymentRepository
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 9999
        };

        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => handler.HandleAsync(request)
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenPaymentAlreadyExists()
    {
        var order = CreateOrder(
            id: 1,
            quantity: 2,
            unitPrice: 43.90m
        );

        var existingPayment = new Payment(
            order.Id,
            order.Total
        );

        var orderRepository = new FakeOrderRepository(order);
        var paymentRepository = new FakePaymentRepository(existingPayment);

        var handler = new CreatePaymentHandler(
            orderRepository,
            paymentRepository
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 1
        };

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(request)
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenOrderIsNotPendingPayment()
    {
        var order = CreateOrder(
            id: 1,
            quantity: 1,
            unitPrice: 43.90m
        );

        order.MarkAsReceived();

        var orderRepository = new FakeOrderRepository(order);
        var paymentRepository = new FakePaymentRepository();

        var handler = new CreatePaymentHandler(
            orderRepository,
            paymentRepository
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 1
        };

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(request)
        );
    }

    private static Order CreateOrder(
        int id,
        int quantity,
        decimal unitPrice)
    {
        var order = new Order(deliveryFee: 0m);

        order.AddItem(
            new OrderItem(
                productId: 1,
                quantity: quantity,
                unitPrice: unitPrice
            )
        );

        SetPrivateProperty(
            order,
            nameof(Order.Id),
            id
        );

        return order;
    }

    private static void SetPrivateProperty<T>(
        T instance,
        string propertyName,
        object value)
    {
        var property = typeof(T).GetProperty(
            propertyName,
            BindingFlags.Instance | BindingFlags.Public
        );

        property?.SetValue(instance, value);
    }

    private sealed class FakeOrderRepository : IOrderRepository
    {
        private readonly Order? _order;

        public FakeOrderRepository(Order? order = null)
        {
            _order = order;
        }

        public Task AddAsync(
            Order order,
            CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }

        public Task<Order?> GetByIdAsync(
            int id,
            CancellationToken cancellationToken = default)
        {
            if (_order?.Id == id)
                return Task.FromResult<Order?>(_order);

            return Task.FromResult<Order?>(null);
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }
    }

    private sealed class FakePaymentRepository : IPaymentRepository
    {
        private readonly Payment? _existingPayment;

        public Payment? AddedPayment { get; private set; }

        public FakePaymentRepository(
            Payment? existingPayment = null)
        {
            _existingPayment = existingPayment;
        }

        public Task AddAsync(
            Payment payment,
            CancellationToken cancellationToken = default)
        {
            AddedPayment = payment;

            return Task.CompletedTask;
        }

        public Task<Payment?> GetByOrderIdAsync(
            int orderId,
            CancellationToken cancellationToken = default)
        {
            if (_existingPayment?.OrderId == orderId)
                return Task.FromResult<Payment?>(_existingPayment);

            return Task.FromResult<Payment?>(null);
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            if (AddedPayment is not null)
            {
                SetPrivateProperty(
                    AddedPayment,
                    nameof(Payment.Id),
                    200
                );
            }

            return Task.CompletedTask;
        }
    }
}