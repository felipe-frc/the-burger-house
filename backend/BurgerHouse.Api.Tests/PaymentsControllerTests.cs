using System.Net;
using System.Reflection;

using BurgerHouse.Api.Controllers;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.CreatePayment;
using BurgerHouse.Application.Payments.ProcessCardPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

using Microsoft.AspNetCore.Mvc;

using Xunit;

namespace BurgerHouse.Api.Tests;

public class PaymentsControllerTests
{
    private const string IdempotencyKey =
        "11111111-1111-4111-8111-111111111111";

    [Fact]
    public async Task ProcessCardAsync_ShouldUsePaymentIdFromRoute()
    {
        var payment = CreatePayment(
            id: 10,
            orderId: 25,
            amount: 87.80m
        );

        var repository =
            new FakePaymentRepository(payment);

        var gateway = new FakePaymentGateway(
            new PaymentGatewayResult
            {
                ExternalOrderId = "mp-order-123",
                ExternalPaymentId = "mp-payment-456",
                Status = PaymentGatewayStatus.Approved,
                StatusDetail = "accredited"
            }
        );

        var controller = CreateController(
            repository,
            gateway
        );

        var body = new ProcessCardPaymentRequest
        {
            PaymentId = 999,
            PaymentToken = "temporary-payment-token",
            PaymentMethodId = "master",
            Installments = 2,
            PayerEmail = "cliente@email.com"
        };

        var result = await controller.ProcessCardAsync(
            paymentId: 10,
            request: body,
            cancellationToken: CancellationToken.None
        );

        var okResult =
            Assert.IsType<OkObjectResult>(result.Result);

        var response =
            Assert.IsType<ProcessCardPaymentResponse>(
                okResult.Value
            );

        Assert.Equal(10, response.PaymentId);

        Assert.NotNull(gateway.ReceivedRequest);

        Assert.Equal(
            25,
            gateway.ReceivedRequest.OrderId
        );

        Assert.Equal(
            87.80m,
            gateway.ReceivedRequest.Amount
        );
    }

    [Fact]
    public async Task ProcessCardAsync_ShouldReturnNotFound_WhenPaymentDoesNotExist()
    {
        var repository =
            new FakePaymentRepository();

        var gateway = new FakePaymentGateway(
            new PaymentGatewayResult()
        );

        var controller = CreateController(
            repository,
            gateway
        );

        var result = await controller.ProcessCardAsync(
            paymentId: 999,
            request: CreateValidRequest(),
            cancellationToken: CancellationToken.None
        );

        Assert.IsType<NotFoundObjectResult>(
            result.Result
        );

        Assert.Equal(0, gateway.CallCount);
    }

    [Fact]
    public async Task ProcessCardAsync_ShouldReturnBadRequest_WhenInputIsInvalid()
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var gateway = new FakePaymentGateway(
            new PaymentGatewayResult()
        );

        var controller = CreateController(
            repository,
            gateway
        );

        var request = new ProcessCardPaymentRequest
        {
            PaymentToken = "",
            PaymentMethodId = "master",
            Installments = 2,
            PayerEmail = "cliente@email.com"
        };

        var result = await controller.ProcessCardAsync(
            paymentId: 10,
            request: request,
            cancellationToken: CancellationToken.None
        );

        Assert.IsType<BadRequestObjectResult>(
            result.Result
        );

        Assert.Equal(0, gateway.CallCount);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.Conflict)]
    public async Task ProcessCardAsync_ShouldReturnUnprocessableEntity_WhenProviderRejectsRequest(
        HttpStatusCode statusCode)
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var gateway = new FakePaymentGateway(
            new HttpRequestException(
                "Provider rejected the request.",
                inner: null,
                statusCode: statusCode
            )
        );

        var controller = CreateController(
            repository,
            gateway
        );

        var result = await controller.ProcessCardAsync(
            paymentId: 10,
            request: CreateValidRequest(),
            cancellationToken: CancellationToken.None
        );

        var objectResult =
            Assert.IsType<UnprocessableEntityObjectResult>(
                result.Result
            );

        Assert.Equal(
            422,
            objectResult.StatusCode
        );

        Assert.Equal(
            "payment_provider_rejected",
            GetResponseCode(objectResult.Value)
        );

        Assert.Equal(
            PaymentStatus.Rejected,
            payment.Status
        );

        Assert.Equal(
            1,
            gateway.CallCount
        );
    }

    [Fact]
    public async Task ProcessCardAsync_ShouldReturnBadGateway_WhenProviderFails()
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var gateway = new FakePaymentGateway(
            new HttpRequestException(
                "Provider failure.",
                inner: null,
                statusCode: HttpStatusCode.ServiceUnavailable
            )
        );

        var controller = CreateController(
            repository,
            gateway
        );

        var result = await controller.ProcessCardAsync(
            paymentId: 10,
            request: CreateValidRequest(),
            cancellationToken: CancellationToken.None
        );

        var objectResult =
            Assert.IsType<ObjectResult>(
                result.Result
            );

        Assert.Equal(
            502,
            objectResult.StatusCode
        );

        Assert.Equal(
            "payment_provider_unavailable",
            GetResponseCode(objectResult.Value)
        );

        Assert.Equal(
            PaymentStatus.Pending,
            payment.Status
        );

        Assert.Equal(
            1,
            gateway.CallCount
        );
    }

    private static string? GetResponseCode(
        object? response)
    {
        if (response is null)
        {
            return null;
        }

        var property = response
            .GetType()
            .GetProperty(
                "code",
                BindingFlags.Instance |
                BindingFlags.Public
            );

        return property?.GetValue(response)?.ToString();
    }

    private static PaymentsController CreateController(
        IPaymentRepository paymentRepository,
        IPaymentGateway paymentGateway)
    {
        var createPaymentHandler =
            new CreatePaymentHandler(
                new FakeOrderRepository(),
                paymentRepository
            );

        var processCardPaymentHandler =
            new ProcessCardPaymentHandler(
                paymentRepository,
                paymentGateway
            );

        return new PaymentsController(
            createPaymentHandler,
            processCardPaymentHandler
        );
    }

    private static ProcessCardPaymentRequest CreateValidRequest()
    {
        return new ProcessCardPaymentRequest
        {
            PaymentToken = "temporary-payment-token",
            PaymentMethodId = "master",
            Installments = 2,
            PayerEmail = "cliente@email.com"
        };
    }

    private static Payment CreatePayment(
        int id = 10,
        int orderId = 25,
        decimal amount = 87.80m)
    {
        var payment = new Payment(
            orderId,
            amount,
            IdempotencyKey
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

        property?.SetValue(
            instance,
            value
        );
    }

    private sealed class FakePaymentGateway : IPaymentGateway
    {
        private readonly PaymentGatewayResult? _result;
        private readonly Exception? _exception;

        public int CallCount { get; private set; }

        public PaymentGatewayRequest? ReceivedRequest
        {
            get;
            private set;
        }

        public FakePaymentGateway(
            PaymentGatewayResult result)
        {
            _result = result;
        }

        public FakePaymentGateway(
            Exception exception)
        {
            _exception = exception;
        }

        public Task<PaymentGatewayResult> ProcessAsync(
            PaymentGatewayRequest request,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            ReceivedRequest = request;

            if (_exception is not null)
            {
                throw _exception;
            }

            return Task.FromResult(
                _result!
            );
        }
    }

    private sealed class FakePaymentRepository
        : IPaymentRepository
    {
        private readonly List<Payment> _payments;

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
            return Task.CompletedTask;
        }
    }

    private sealed class FakeOrderRepository
        : IOrderRepository
    {
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
            return Task.FromResult<Order?>(null);
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }
    }
}