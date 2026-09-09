using System.Net;
using System.Reflection;

using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.ProcessPixPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Tests;

public class ProcessPixPaymentHandlerTests
{
    private const string IdempotencyKey =
        "11111111-1111-4111-8111-111111111111";

    [Fact]
    public async Task HandleAsync_ShouldCreatePixPaymentInstructions()
    {
        var payment =
            CreatePayment(
                PaymentMethod.Pix
            );

        var repository =
            new FakePaymentRepository(
                payment
            );

        var gateway =
            new FakePaymentGateway(
                new PaymentGatewayResult
                {
                    ExternalOrderId =
                        "mp-order-123",

                    ExternalPaymentId =
                        "mp-payment-456",

                    Status =
                        PaymentGatewayStatus
                            .Pending,

                    StatusDetail =
                        "waiting_transfer",

                    PixTicketUrl =
                        "https://mercadopago.com/pix",

                    PixQrCode =
                        "000201PIXCODE",

                    PixQrCodeBase64 =
                        "BASE64QR"
                }
            );

        var handler =
            new ProcessPixPaymentHandler(
                repository,
                gateway
            );

        var response =
            await handler.HandleAsync(
                new ProcessPixPaymentRequest
                {
                    PaymentId = 10,

                    PayerEmail =
                        "cliente@email.com"
                }
            );

        Assert.Equal(
            PaymentStatus.Pending,
            response.Status
        );

        Assert.Equal(
            "000201PIXCODE",
            response.QrCode
        );

        Assert.Equal(
            "BASE64QR",
            response.QrCodeBase64
        );

        Assert.Equal(
            "https://mercadopago.com/pix",
            response.TicketUrl
        );

        Assert.Equal(
            "mp-order-123",
            payment.ExternalOrderId
        );

        Assert.Equal(
            "mp-payment-456",
            payment.ExternalPaymentId
        );

        Assert.NotNull(
            gateway.ReceivedRequest
        );

        Assert.Equal(
            PaymentMethod.Pix,
            gateway
                .ReceivedRequest
                .Method
        );

        Assert.Equal(
            25,
            gateway
                .ReceivedRequest
                .OrderId
        );

        Assert.Equal(
            87.80m,
            gateway
                .ReceivedRequest
                .Amount
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldRejectNonPixPayment()
    {
        var payment =
            CreatePayment(
                PaymentMethod.CreditCard
            );

        var gateway =
            new FakePaymentGateway(
                new PaymentGatewayResult()
            );

        var handler =
            new ProcessPixPaymentHandler(
                new FakePaymentRepository(
                    payment
                ),
                gateway
            );

        await Assert.ThrowsAsync<
            InvalidOperationException>(
            () => handler.HandleAsync(
                new ProcessPixPaymentRequest
                {
                    PaymentId = 10,

                    PayerEmail =
                        "cliente@email.com"
                }
            )
        );

        Assert.Equal(
            0,
            gateway.CallCount
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldRejectPayment_WhenProviderReturnsClientError()
    {
        var payment =
            CreatePayment(
                PaymentMethod.Pix
            );

        var gateway =
            new FakePaymentGateway(
                new HttpRequestException(
                    "Provider rejected.",
                    inner: null,
                    statusCode:
                        HttpStatusCode
                            .BadRequest
                )
            );

        var handler =
            new ProcessPixPaymentHandler(
                new FakePaymentRepository(
                    payment
                ),
                gateway
            );

        await Assert.ThrowsAsync<
            HttpRequestException>(
            () => handler.HandleAsync(
                new ProcessPixPaymentRequest
                {
                    PaymentId = 10,

                    PayerEmail =
                        "cliente@email.com"
                }
            )
        );

        Assert.Equal(
            PaymentStatus.Rejected,
            payment.Status
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldKeepPending_WhenProviderIsUnavailable()
    {
        var payment =
            CreatePayment(
                PaymentMethod.Pix
            );

        var gateway =
            new FakePaymentGateway(
                new HttpRequestException(
                    "Provider unavailable.",
                    inner: null,
                    statusCode:
                        HttpStatusCode
                            .ServiceUnavailable
                )
            );

        var handler =
            new ProcessPixPaymentHandler(
                new FakePaymentRepository(
                    payment
                ),
                gateway
            );

        await Assert.ThrowsAsync<
            HttpRequestException>(
            () => handler.HandleAsync(
                new ProcessPixPaymentRequest
                {
                    PaymentId = 10,

                    PayerEmail =
                        "cliente@email.com"
                }
            )
        );

        Assert.Equal(
            PaymentStatus.Pending,
            payment.Status
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldRejectPendingResultWithoutPixInstructions()
    {
        var payment =
            CreatePayment(
                PaymentMethod.Pix
            );

        var gateway =
            new FakePaymentGateway(
                new PaymentGatewayResult
                {
                    ExternalOrderId =
                        "mp-order-123",

                    ExternalPaymentId =
                        "mp-payment-456",

                    Status =
                        PaymentGatewayStatus
                            .Pending,

                    StatusDetail =
                        "waiting_transfer"
                }
            );

        var handler =
            new ProcessPixPaymentHandler(
                new FakePaymentRepository(
                    payment
                ),
                gateway
            );

        await Assert.ThrowsAsync<
            InvalidOperationException>(
            () => handler.HandleAsync(
                new ProcessPixPaymentRequest
                {
                    PaymentId = 10,

                    PayerEmail =
                        "cliente@email.com"
                }
            )
        );
    }

    private static Payment CreatePayment(
        PaymentMethod method)
    {
        var payment =
            new Payment(
                orderId: 25,
                amount: 87.80m,
                idempotencyKey:
                    IdempotencyKey,
                method: method
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

    private sealed class FakePaymentGateway
        : IPaymentGateway
    {
        private readonly
            PaymentGatewayResult? _result;

        private readonly
            Exception? _exception;

        public int CallCount
        {
            get;
            private set;
        }

        public PaymentGatewayRequest?
            ReceivedRequest
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

        public Task<PaymentGatewayResult>
            ProcessAsync(
                PaymentGatewayRequest request,
                CancellationToken cancellationToken =
                    default)
        {
            CallCount++;

            ReceivedRequest =
                request;

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
            return Task.FromResult(
                _payments.FirstOrDefault(
                    payment =>
                        payment.Id ==
                        paymentId
                )
            );
        }

        public Task<Payment?>
            GetByExternalOrderIdAsync(
                string externalOrderId,
                CancellationToken cancellationToken =
                    default)
        {
            return Task.FromResult(
                _payments.FirstOrDefault(
                    payment =>
                        payment
                            .ExternalOrderId ==
                        externalOrderId
                )
            );
        }

        public Task<Payment?>
            GetByIdempotencyKeyAsync(
                string idempotencyKey,
                CancellationToken cancellationToken =
                    default)
        {
            return Task.FromResult(
                _payments.FirstOrDefault(
                    payment =>
                        payment
                            .IdempotencyKey ==
                        idempotencyKey
                )
            );
        }

        public Task<Payment?>
            GetActiveByOrderIdAsync(
                int orderId,
                CancellationToken cancellationToken =
                    default)
        {
            return Task.FromResult(
                _payments.FirstOrDefault(
                    payment =>
                        payment.OrderId ==
                        orderId &&
                        (
                            payment.Status ==
                                PaymentStatus
                                    .Pending ||
                            payment.Status ==
                                PaymentStatus
                                    .Approved
                        )
                )
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