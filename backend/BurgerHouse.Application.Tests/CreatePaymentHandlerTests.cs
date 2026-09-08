using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.CreatePayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using System.Reflection;

namespace BurgerHouse.Application.Tests;

public class CreatePaymentHandlerTests
{
    private const string Key1 =
        "11111111-1111-4111-8111-111111111111";

    private const string Key2 =
        "22222222-2222-4222-8222-222222222222";

    [Fact]
    public async Task HandleAsync_ShouldCreatePaymentUsingOrderTotal()
    {
        var order = CreateOrder(
            id: 1,
            quantity: 2,
            unitPrice: 43.90m
        );

        var orderRepository =
            new FakeOrderRepository(order);

        var paymentRepository =
            new FakePaymentRepository();

        var handler = new CreatePaymentHandler(
            orderRepository,
            paymentRepository
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 1,
            IdempotencyKey = Key1
        };

        var response = await handler.HandleAsync(request);

        Assert.Equal(200, response.PaymentId);
        Assert.Equal(1, response.OrderId);
        Assert.Equal(87.80m, response.Amount);
        Assert.Equal(PaymentStatus.Pending, response.Status);

        Assert.NotNull(paymentRepository.AddedPayment);

        Assert.Equal(
            Key1,
            paymentRepository.AddedPayment.IdempotencyKey
        );

        Assert.Equal(
            87.80m,
            paymentRepository.AddedPayment.Amount
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldReturnExistingPayment_WhenIdempotencyKeyIsRepeated()
    {
        var order = CreateOrder(
            id: 1,
            quantity: 2,
            unitPrice: 43.90m
        );

        var existingPayment = CreatePayment(
            id: 50,
            orderId: 1,
            amount: 87.80m,
            key: Key1
        );

        var orderRepository =
            new FakeOrderRepository(order);

        var paymentRepository =
            new FakePaymentRepository(existingPayment);

        var handler = new CreatePaymentHandler(
            orderRepository,
            paymentRepository
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 1,
            IdempotencyKey = Key1
        };

        var response = await handler.HandleAsync(request);

        Assert.Equal(50, response.PaymentId);
        Assert.Equal(1, response.OrderId);
        Assert.Equal(87.80m, response.Amount);

        Assert.Null(paymentRepository.AddedPayment);
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenOrderIdIsInvalid()
    {
        var handler = new CreatePaymentHandler(
            new FakeOrderRepository(),
            new FakePaymentRepository()
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 0,
            IdempotencyKey = Key1
        };

        await Assert.ThrowsAsync<ArgumentException>(
            () => handler.HandleAsync(request)
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenIdempotencyKeyIsInvalid()
    {
        var handler = new CreatePaymentHandler(
            new FakeOrderRepository(),
            new FakePaymentRepository()
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 1,
            IdempotencyKey = "invalid-key"
        };

        await Assert.ThrowsAsync<ArgumentException>(
            () => handler.HandleAsync(request)
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenOrderDoesNotExist()
    {
        var handler = new CreatePaymentHandler(
            new FakeOrderRepository(),
            new FakePaymentRepository()
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 9999,
            IdempotencyKey = Key1
        };

        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => handler.HandleAsync(request)
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenActivePaymentAlreadyExists()
    {
        var order = CreateOrder(
            id: 1,
            quantity: 1,
            unitPrice: 43.90m
        );

        var existingPayment = CreatePayment(
            id: 10,
            orderId: 1,
            amount: 43.90m,
            key: Key1
        );

        var handler = new CreatePaymentHandler(
            new FakeOrderRepository(order),
            new FakePaymentRepository(existingPayment)
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 1,
            IdempotencyKey = Key2
        };

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(request)
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldAllowRetry_WhenPreviousPaymentWasRejected()
    {
        var order = CreateOrder(
            id: 1,
            quantity: 1,
            unitPrice: 43.90m
        );

        var rejectedPayment = CreatePayment(
            id: 10,
            orderId: 1,
            amount: 43.90m,
            key: Key1
        );

        rejectedPayment.Reject();

        var paymentRepository =
            new FakePaymentRepository(rejectedPayment);

        var handler = new CreatePaymentHandler(
            new FakeOrderRepository(order),
            paymentRepository
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 1,
            IdempotencyKey = Key2
        };

        var response = await handler.HandleAsync(request);

        Assert.Equal(200, response.PaymentId);

        Assert.NotNull(
            paymentRepository.AddedPayment
        );

        Assert.Equal(
            Key2,
            paymentRepository.AddedPayment.IdempotencyKey
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

        var handler = new CreatePaymentHandler(
            new FakeOrderRepository(order),
            new FakePaymentRepository()
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 1,
            IdempotencyKey = Key1
        };

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(request)
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenIdempotencyKeyBelongsToAnotherOrder()
    {
        var existingPayment = CreatePayment(
            id: 10,
            orderId: 1,
            amount: 43.90m,
            key: Key1
        );

        var handler = new CreatePaymentHandler(
            new FakeOrderRepository(),
            new FakePaymentRepository(existingPayment)
        );

        var request = new CreatePaymentRequest
        {
            OrderId = 2,
            IdempotencyKey = Key1
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

    private static Payment CreatePayment(
        int id,
        int orderId,
        decimal amount,
        string key)
    {
        var payment = new Payment(
            orderId,
            amount,
            key
        );

        SetPrivateProperty(
            payment,
            nameof(Payment.Id),
            id
        );

        return payment;
    }

    private static void SetPrivateProperty<T>(
        T instance,
        string propertyName,
        object value)
    {
        var property = typeof(T).GetProperty(
            propertyName,
            BindingFlags.Instance |
            BindingFlags.Public
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
        private readonly List<Payment> _payments;

        public Payment? AddedPayment { get; private set; }

        public FakePaymentRepository(
            params Payment[] payments)
        {
            _payments = [.. payments];
        }

        public Task AddAsync(
            Payment payment,
            CancellationToken cancellationToken = default)
        {
            AddedPayment = payment;
            _payments.Add(payment);

            return Task.CompletedTask;
        }

        public Task<Payment?> GetByIdAsync(
            int paymentId,
            CancellationToken cancellationToken = default)
        {
            var payment = _payments.FirstOrDefault(
                item => item.Id == paymentId
            );

            return Task.FromResult(payment);
        }

        public Task<Payment?> GetByExternalOrderIdAsync(
            string externalOrderId,
            CancellationToken cancellationToken = default)
        {
            var payment = _payments.FirstOrDefault(
                item =>
                    item.ExternalOrderId ==
                    externalOrderId
            );

            return Task.FromResult(payment);
        }

        public Task<Payment?> GetByIdempotencyKeyAsync(
            string idempotencyKey,
            CancellationToken cancellationToken = default)
        {
            var payment = _payments.FirstOrDefault(
                item =>
                    item.IdempotencyKey ==
                    idempotencyKey
            );

            return Task.FromResult(payment);
        }

        public Task<Payment?> GetActiveByOrderIdAsync(
            int orderId,
            CancellationToken cancellationToken = default)
        {
            var payment = _payments.FirstOrDefault(
                item =>
                    item.OrderId == orderId &&
                    (
                        item.Status == PaymentStatus.Pending ||
                        item.Status == PaymentStatus.Approved
                    )
            );

            return Task.FromResult(payment);
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            if (AddedPayment is not null &&
                AddedPayment.Id == 0)
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