using System.Reflection;

using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.GetPaymentStatus;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Tests;

public class GetPaymentStatusHandlerTests
{
    private const string IdempotencyKey =
        "11111111-1111-4111-8111-111111111111";

    [Fact]
    public async Task HandleAsync_ShouldReturnPaymentStatus()
    {
        var payment =
            CreatePayment(
                method:
                    PaymentMethod.Pix
            );

        var repository =
            new FakePaymentRepository(
                payment
            );

        var handler =
            new GetPaymentStatusHandler(
                repository
            );

        var response =
            await handler.HandleAsync(
                10
            );

        Assert.Equal(
            10,
            response.PaymentId
        );

        Assert.Equal(
            25,
            response.OrderId
        );

        Assert.Equal(
            87.80m,
            response.Amount
        );

        Assert.Equal(
            PaymentStatus.Pending,
            response.Status
        );

        Assert.Equal(
            PaymentMethod.Pix,
            response.Method
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldReturnApprovedStatus()
    {
        var payment =
            CreatePayment(
                method:
                    PaymentMethod.Pix
            );

        payment.Approve();

        var handler =
            new GetPaymentStatusHandler(
                new FakePaymentRepository(
                    payment
                )
            );

        var response =
            await handler.HandleAsync(
                10
            );

        Assert.Equal(
            PaymentStatus.Approved,
            response.Status
        );

        Assert.NotNull(
            response.UpdatedAt
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenPaymentDoesNotExist()
    {
        var handler =
            new GetPaymentStatusHandler(
                new FakePaymentRepository()
            );

        await Assert.ThrowsAsync<
            KeyNotFoundException>(
            () => handler.HandleAsync(
                999
            )
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldRejectInvalidPaymentId()
    {
        var handler =
            new GetPaymentStatusHandler(
                new FakePaymentRepository()
            );

        await Assert.ThrowsAsync<
            ArgumentException>(
            () => handler.HandleAsync(
                0
            )
        );
    }

    private static Payment CreatePayment(
        int id = 10,
        int orderId = 25,
        decimal amount = 87.80m,
        PaymentMethod method =
            PaymentMethod.CreditCard)
    {
        var payment =
            new Payment(
                orderId,
                amount,
                IdempotencyKey,
                method
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
        var property =
            typeof(T).GetProperty(
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
        private readonly List<Payment>
            _payments;

        public FakePaymentRepository(
            params Payment[] payments)
        {
            _payments =
                [.. payments];
        }

        public Task AddAsync(
            Payment payment,
            CancellationToken cancellationToken =
                default)
        {
            _payments.Add(
                payment
            );

            return Task.CompletedTask;
        }

        public Task<Payment?> GetByIdAsync(
            int paymentId,
            CancellationToken cancellationToken =
                default)
        {
            var payment =
                _payments.FirstOrDefault(
                    item =>
                        item.Id ==
                        paymentId
                );

            return Task.FromResult(
                payment
            );
        }

        public Task<Payment?>
            GetByExternalOrderIdAsync(
                string externalOrderId,
                CancellationToken cancellationToken =
                    default)
        {
            var payment =
                _payments.FirstOrDefault(
                    item =>
                        item.ExternalOrderId ==
                        externalOrderId
                );

            return Task.FromResult(
                payment
            );
        }

        public Task<Payment?>
            GetByIdempotencyKeyAsync(
                string idempotencyKey,
                CancellationToken cancellationToken =
                    default)
        {
            var payment =
                _payments.FirstOrDefault(
                    item =>
                        item.IdempotencyKey ==
                        idempotencyKey
                );

            return Task.FromResult(
                payment
            );
        }

        public Task<Payment?>
            GetActiveByOrderIdAsync(
                int orderId,
                CancellationToken cancellationToken =
                    default)
        {
            var payment =
                _payments.FirstOrDefault(
                    item =>
                        item.OrderId ==
                            orderId &&
                        (
                            item.Status ==
                                PaymentStatus.Pending ||
                            item.Status ==
                                PaymentStatus.Approved
                        )
                );

            return Task.FromResult(
                payment
            );
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken =
                default)
        {
            return Task.CompletedTask;
        }
    }
}