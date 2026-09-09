using System.Reflection;

using BurgerHouse.Api.Controllers;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Application.Payments.CreatePayment;
using BurgerHouse.Application.Payments.GetPaymentStatus;
using BurgerHouse.Application.Payments.ProcessCardPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Tests;

public class GetPaymentStatusControllerTests
{
    private const string IdempotencyKey =
        "11111111-1111-4111-8111-111111111111";

    [Fact]
    public async Task GetStatusAsync_ShouldReturnPaymentStatus()
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

        var controller =
            CreateController(
                repository
            );

        var result =
            await controller.GetStatusAsync(
                paymentId: 10,
                cancellationToken:
                    CancellationToken.None
            );

        var okResult =
            Assert.IsType<OkObjectResult>(
                result.Result
            );

        var response =
            Assert.IsType<GetPaymentStatusResponse>(
                okResult.Value
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
    public async Task GetStatusAsync_ShouldReturnApprovedStatus()
    {
        var payment =
            CreatePayment(
                method:
                    PaymentMethod.Pix
            );

        payment.Approve();

        var controller =
            CreateController(
                new FakePaymentRepository(
                    payment
                )
            );

        var result =
            await controller.GetStatusAsync(
                paymentId: 10,
                cancellationToken:
                    CancellationToken.None
            );

        var okResult =
            Assert.IsType<OkObjectResult>(
                result.Result
            );

        var response =
            Assert.IsType<GetPaymentStatusResponse>(
                okResult.Value
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
    public async Task GetStatusAsync_ShouldReturnNotFound_WhenPaymentDoesNotExist()
    {
        var controller =
            CreateController(
                new FakePaymentRepository()
            );

        var result =
            await controller.GetStatusAsync(
                paymentId: 999,
                cancellationToken:
                    CancellationToken.None
            );

        Assert.IsType<NotFoundObjectResult>(
            result.Result
        );
    }

    [Fact]
    public async Task GetStatusAsync_ShouldReturnBadRequest_WhenPaymentIdIsInvalid()
    {
        var controller =
            CreateController(
                new FakePaymentRepository()
            );

        var result =
            await controller.GetStatusAsync(
                paymentId: 0,
                cancellationToken:
                    CancellationToken.None
            );

        Assert.IsType<BadRequestObjectResult>(
            result.Result
        );
    }

    private static PaymentsController
        CreateController(
            IPaymentRepository
                paymentRepository)
    {
        var createPaymentHandler =
            new CreatePaymentHandler(
                new FakeOrderRepository(),
                paymentRepository
            );

        var processCardPaymentHandler =
            new ProcessCardPaymentHandler(
                paymentRepository,
                new FakePaymentGateway()
            );

        var getPaymentStatusHandler =
            new GetPaymentStatusHandler(
                paymentRepository
            );

        return new PaymentsController(
            createPaymentHandler,
            processCardPaymentHandler,
            processPixPaymentHandler: null,
            getPaymentStatusHandler:
                getPaymentStatusHandler
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

    private sealed class
        FakePaymentGateway
        : IPaymentGateway
    {
        public Task<PaymentGatewayResult>
            ProcessAsync(
                PaymentGatewayRequest request,
                CancellationToken
                    cancellationToken =
                        default)
        {
            throw new InvalidOperationException(
                "Payment gateway should not be called by GET status tests."
            );
        }
    }

    private sealed class
        FakePaymentRepository
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
            CancellationToken
                cancellationToken =
                    default)
        {
            _payments.Add(
                payment
            );

            return Task.CompletedTask;
        }

        public Task<Payment?>
            GetByIdAsync(
                int paymentId,
                CancellationToken
                    cancellationToken =
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
                CancellationToken
                    cancellationToken =
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
                CancellationToken
                    cancellationToken =
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
                CancellationToken
                    cancellationToken =
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
            CancellationToken
                cancellationToken =
                    default)
        {
            return Task.CompletedTask;
        }
    }

    private sealed class
        FakeOrderRepository
        : IOrderRepository
    {
        public Task AddAsync(
            Order order,
            CancellationToken
                cancellationToken =
                    default)
        {
            return Task.CompletedTask;
        }

        public Task<Order?>
            GetByIdAsync(
                int id,
                CancellationToken
                    cancellationToken =
                        default)
        {
            return Task.FromResult<
                Order?>(null);
        }

        public Task SaveChangesAsync(
            CancellationToken
                cancellationToken =
                    default)
        {
            return Task.CompletedTask;
        }
    }
}