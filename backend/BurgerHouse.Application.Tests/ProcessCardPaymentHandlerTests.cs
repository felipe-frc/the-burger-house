using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.ProcessCardPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using System.Reflection;

namespace BurgerHouse.Application.Tests;

public class ProcessCardPaymentHandlerTests
{
    private const string IdempotencyKey =
        "11111111-1111-4111-8111-111111111111";

    [Fact]
    public async Task HandleAsync_ShouldUsePaymentDataFromBackend()
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
                Status = PaymentGatewayStatus.Pending,
                StatusDetail = "processing"
            }
        );

        var handler = new ProcessCardPaymentHandler(
            repository,
            gateway
        );

        await handler.HandleAsync(
            CreateValidRequest()
        );

        Assert.NotNull(gateway.ReceivedRequest);

        Assert.Equal(
            25,
            gateway.ReceivedRequest.OrderId
        );

        Assert.Equal(
            87.80m,
            gateway.ReceivedRequest.Amount
        );

        Assert.Equal(
            IdempotencyKey,
            gateway.ReceivedRequest.IdempotencyKey
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldApprovePaymentAndPersistExternalIds()
    {
        var payment = CreatePayment();

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

        var handler = new ProcessCardPaymentHandler(
            repository,
            gateway
        );

        var response = await handler.HandleAsync(
            CreateValidRequest()
        );

        Assert.Equal(
            PaymentStatus.Approved,
            payment.Status
        );

        Assert.Equal(
            "mp-order-123",
            payment.ExternalOrderId
        );

        Assert.Equal(
            "mp-payment-456",
            payment.ExternalPaymentId
        );

        Assert.Equal(1, repository.SaveChangesCount);

        Assert.Equal(
            PaymentStatus.Approved,
            response.Status
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldKeepPaymentPending_WhenGatewayIsPending()
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var gateway = new FakePaymentGateway(
            new PaymentGatewayResult
            {
                ExternalOrderId = "mp-order-123",
                ExternalPaymentId = "mp-payment-456",
                Status = PaymentGatewayStatus.Pending,
                StatusDetail = "processing"
            }
        );

        var handler = new ProcessCardPaymentHandler(
            repository,
            gateway
        );

        var response = await handler.HandleAsync(
            CreateValidRequest()
        );

        Assert.Equal(
            PaymentStatus.Pending,
            payment.Status
        );

        Assert.Equal(
            PaymentStatus.Pending,
            response.Status
        );

        Assert.Equal(1, repository.SaveChangesCount);
    }

    [Fact]
    public async Task HandleAsync_ShouldRejectPayment_WhenGatewayRejects()
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var gateway = new FakePaymentGateway(
            new PaymentGatewayResult
            {
                ExternalOrderId = "mp-order-123",
                ExternalPaymentId = "mp-payment-456",
                Status = PaymentGatewayStatus.Rejected,
                StatusDetail = "rejected_by_issuer"
            }
        );

        var handler = new ProcessCardPaymentHandler(
            repository,
            gateway
        );

        await handler.HandleAsync(
            CreateValidRequest()
        );

        Assert.Equal(
            PaymentStatus.Rejected,
            payment.Status
        );

        Assert.Equal(1, repository.SaveChangesCount);
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenPaymentDoesNotExist()
    {
        var repository =
            new FakePaymentRepository();

        var gateway = new FakePaymentGateway(
            new PaymentGatewayResult()
        );

        var handler = new ProcessCardPaymentHandler(
            repository,
            gateway
        );

        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => handler.HandleAsync(
                CreateValidRequest()
            )
        );

        Assert.Equal(0, gateway.CallCount);
        Assert.Equal(0, repository.SaveChangesCount);
    }

    [Fact]
    public async Task HandleAsync_ShouldNotCallGateway_WhenPaymentIsNotPending()
    {
        var payment = CreatePayment();
        payment.Approve();

        var repository =
            new FakePaymentRepository(payment);

        var gateway = new FakePaymentGateway(
            new PaymentGatewayResult()
        );

        var handler = new ProcessCardPaymentHandler(
            repository,
            gateway
        );

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(
                CreateValidRequest()
            )
        );

        Assert.Equal(0, gateway.CallCount);
        Assert.Equal(0, repository.SaveChangesCount);
    }

    [Fact]
    public async Task HandleAsync_ShouldRejectInvalidRequestBeforeGatewayCall()
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var gateway = new FakePaymentGateway(
            new PaymentGatewayResult()
        );

        var handler = new ProcessCardPaymentHandler(
            repository,
            gateway
        );

        var request = CreateValidRequest();

        request = new ProcessCardPaymentRequest
        {
            PaymentId = request.PaymentId,
            PaymentToken = "",
            PaymentMethodId = request.PaymentMethodId,
            Installments = request.Installments,
            PayerEmail = request.PayerEmail
        };

        await Assert.ThrowsAsync<ArgumentException>(
            () => handler.HandleAsync(request)
        );

        Assert.Equal(0, gateway.CallCount);
    }

    [Theory]
    [InlineData(PaymentGatewayStatus.Expired)]
    [InlineData(PaymentGatewayStatus.Refunded)]
    [InlineData(PaymentGatewayStatus.PartiallyRefunded)]
    [InlineData(PaymentGatewayStatus.ChargedBack)]
    public async Task HandleAsync_ShouldRejectPostPaymentStatusesDuringInitialProcessing(
        PaymentGatewayStatus gatewayStatus)
    {
        var payment = CreatePayment();

        var repository =
            new FakePaymentRepository(payment);

        var gateway = new FakePaymentGateway(
            new PaymentGatewayResult
            {
                ExternalOrderId = "mp-order-123",
                ExternalPaymentId = "mp-payment-456",
                Status = gatewayStatus
            }
        );

        var handler = new ProcessCardPaymentHandler(
            repository,
            gateway
        );

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(
                CreateValidRequest()
            )
        );

        Assert.Equal(0, repository.SaveChangesCount);
    }

    private static ProcessCardPaymentRequest CreateValidRequest()
    {
        return new ProcessCardPaymentRequest
        {
            PaymentId = 10,
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

        property?.SetValue(instance, value);
    }

    private sealed class FakePaymentGateway : IPaymentGateway
    {
        private readonly PaymentGatewayResult _result;

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

        public Task<PaymentGatewayResult> ProcessAsync(
            PaymentGatewayRequest request,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            ReceivedRequest = request;

            return Task.FromResult(_result);
        }
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