using System.Reflection;

using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.SynchronizePaymentStatus;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Tests;

public class SynchronizePaymentStatusHandlerTests
{
    private const string IdempotencyKey =
        "11111111-1111-4111-8111-111111111111";

    private const string ExternalOrderId =
        "mp-order-123";

    [Fact]
    public async Task HandleAsync_ShouldApprovePendingPayment()
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var handler =
            new SynchronizePaymentStatusHandler(
                repository
            );

        var changed = await handler.HandleAsync(
            ExternalOrderId,
            PaymentGatewayStatus.Approved
        );

        Assert.True(changed);

        Assert.Equal(
            PaymentStatus.Approved,
            payment.Status
        );

        Assert.Equal(
            1,
            repository.SaveChangesCount
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldRejectPendingPayment()
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var handler =
            new SynchronizePaymentStatusHandler(
                repository
            );

        var changed = await handler.HandleAsync(
            ExternalOrderId,
            PaymentGatewayStatus.Rejected
        );

        Assert.True(changed);

        Assert.Equal(
            PaymentStatus.Rejected,
            payment.Status
        );

        Assert.Equal(
            1,
            repository.SaveChangesCount
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldCancelPendingPayment()
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var handler =
            new SynchronizePaymentStatusHandler(
                repository
            );

        var changed = await handler.HandleAsync(
            ExternalOrderId,
            PaymentGatewayStatus.Cancelled
        );

        Assert.True(changed);

        Assert.Equal(
            PaymentStatus.Cancelled,
            payment.Status
        );

        Assert.Equal(
            1,
            repository.SaveChangesCount
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldNotChangePendingPayment_WhenGatewayIsPending()
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var handler =
            new SynchronizePaymentStatusHandler(
                repository
            );

        var changed = await handler.HandleAsync(
            ExternalOrderId,
            PaymentGatewayStatus.Pending
        );

        Assert.False(changed);

        Assert.Equal(
            PaymentStatus.Pending,
            payment.Status
        );

        Assert.Equal(
            0,
            repository.SaveChangesCount
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldBeIdempotent_WhenStatusAlreadyMatches()
    {
        var payment = CreatePayment();

        payment.Approve();

        var repository =
            new FakePaymentRepository(payment);

        var handler =
            new SynchronizePaymentStatusHandler(
                repository
            );

        var changed = await handler.HandleAsync(
            ExternalOrderId,
            PaymentGatewayStatus.Approved
        );

        Assert.False(changed);

        Assert.Equal(
            PaymentStatus.Approved,
            payment.Status
        );

        Assert.Equal(
            0,
            repository.SaveChangesCount
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenPaymentDoesNotExist()
    {
        var repository =
            new FakePaymentRepository();

        var handler =
            new SynchronizePaymentStatusHandler(
                repository
            );

        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => handler.HandleAsync(
                ExternalOrderId,
                PaymentGatewayStatus.Approved
            )
        );

        Assert.Equal(
            0,
            repository.SaveChangesCount
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenTryingToChangeFinalStatus()
    {
        var payment = CreatePayment();

        payment.Reject();

        var repository =
            new FakePaymentRepository(payment);

        var handler =
            new SynchronizePaymentStatusHandler(
                repository
            );

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(
                ExternalOrderId,
                PaymentGatewayStatus.Approved
            )
        );

        Assert.Equal(
            PaymentStatus.Rejected,
            payment.Status
        );

        Assert.Equal(
            0,
            repository.SaveChangesCount
        );
    }

    [Theory]
    [InlineData(PaymentGatewayStatus.Expired)]
    [InlineData(PaymentGatewayStatus.Refunded)]
    [InlineData(PaymentGatewayStatus.PartiallyRefunded)]
    [InlineData(PaymentGatewayStatus.ChargedBack)]
    public async Task HandleAsync_ShouldRejectUnsupportedGatewayStatus(
        PaymentGatewayStatus gatewayStatus)
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var handler =
            new SynchronizePaymentStatusHandler(
                repository
            );

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(
                ExternalOrderId,
                gatewayStatus
            )
        );

        Assert.Equal(
            PaymentStatus.Pending,
            payment.Status
        );

        Assert.Equal(
            0,
            repository.SaveChangesCount
        );
    }

    private static Payment CreatePayment()
    {
        var payment = new Payment(
            orderId: 25,
            amount: 87.80m,
            idempotencyKey: IdempotencyKey
        );

        payment.SetExternalOrderId(
            ExternalOrderId
        );

        SetPrivateProperty(
            payment,
            nameof(Payment.Id),
            10
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

        property?.SetValue(
            instance,
            value
        );
    }

    private sealed class FakePaymentRepository
        : IPaymentRepository
    {
        private readonly List<Payment> _payments;

        public int SaveChangesCount { get; private set; }

        public FakePaymentRepository(
            params Payment[] payments)
        {
            _payments = [.. payments];
        }

        public Task AddAsync(
            Payment payment,
            CancellationToken cancellationToken = default)
        {
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
            SaveChangesCount++;

            return Task.CompletedTask;
        }
    }
}