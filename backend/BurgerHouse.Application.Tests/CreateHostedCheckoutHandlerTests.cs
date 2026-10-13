using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.CreateHostedCheckout;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Tests;

public class CreateHostedCheckoutHandlerTests
{
    [Fact]
    public async Task CreatesHostedCheckoutAndCommitsBothTransactions()
    {
        var order =
            NewOrder();

        var orderRepository =
            new StubOrderRepository(order);

        var paymentRepository =
            new StubPaymentRepository();

        var gateway =
            new StubGateway(
                (payment, customer) =>
                {
                    Assert.True(payment.Id > 0);

                    Assert.Equal(
                        new HostedCheckoutCustomer(
                            "Cliente Teste",
                            "cliente@teste.com",
                            "52998224725",
                            "11999990000"
                        ),
                        customer
                    );

                    payment.SetExternalCheckoutId(
                        "CHEC_1"
                    );

                    return Task.FromResult(
                        new HostedCheckoutSession(
                            payment.Id,
                            "CHEC_1",
                            "https://pagamento.pagbank.com.br/checkout/CHEC_1"
                        )
                    );
                }
            );

        var unitOfWork =
            new StubUnitOfWork();

        var handler =
            CreateHandler(
                orderRepository,
                paymentRepository,
                gateway,
                unitOfWork
            );

        var result =
            await handler.HandleAsync(
                order.Id
            );

        Assert.Equal(
            paymentRepository.Payment!.Id,
            result.PaymentId
        );

        Assert.Equal(
            "https://pagamento.pagbank.com.br/checkout/CHEC_1",
            result.CheckoutUrl
        );

        Assert.Equal(
            2,
            unitOfWork.Transactions.Count
        );

        Assert.All(
            unitOfWork.Transactions,
            transaction =>
                Assert.True(transaction.Committed)
        );

        Assert.Equal(
            1,
            unitOfWork.ClearTrackingCalls
        );

        Assert.Equal(
            1,
            unitOfWork.SaveChangesCalls
        );

        Assert.Equal(
            "CHEC_1",
            paymentRepository.Payment.ExternalCheckoutId
        );
    }

    [Fact]
    public async Task ProviderFailureKeepsPreparedPaymentCommitted()
    {
        var order =
            NewOrder();

        var orderRepository =
            new StubOrderRepository(order);

        var paymentRepository =
            new StubPaymentRepository();

        var gateway =
            new StubGateway(
                (_, _) =>
                    throw new HttpRequestException(
                        "Provider unavailable."
                    )
            );

        var unitOfWork =
            new StubUnitOfWork();

        var handler =
            CreateHandler(
                orderRepository,
                paymentRepository,
                gateway,
                unitOfWork
            );

        await Assert.ThrowsAsync<HttpRequestException>(
            () =>
                handler.HandleAsync(
                    order.Id
                )
        );

        Assert.NotNull(
            paymentRepository.Payment
        );

        Assert.True(
            paymentRepository.Payment!.Id > 0
        );

        Assert.Equal(
            PaymentStatus.Pending,
            paymentRepository.Payment.Status
        );

        Assert.Null(
            paymentRepository.Payment.ExternalCheckoutId
        );

        Assert.Equal(
            2,
            unitOfWork.Transactions.Count
        );

        Assert.True(
            unitOfWork.Transactions[0].Committed
        );

        Assert.False(
            unitOfWork.Transactions[1].Committed
        );
    }

    [Fact]
    public async Task RejectsPaymentThatIsNoLongerPending()
    {
        var order =
            NewOrder();

        var orderRepository =
            new StubOrderRepository(order);

        var paymentRepository =
            new StubPaymentRepository();

        var existingPayment =
            new Payment(
                order.Id,
                order.Total,
                Guid.NewGuid().ToString("D"),
                PaymentMethod.Pix
            );

        existingPayment.SetExternalCheckoutId(
            "CHEC_1"
        );

        existingPayment.Approve();

        paymentRepository.Payment =
            existingPayment;

        var gatewayCalls = 0;

        var gateway =
            new StubGateway(
                (_, _) =>
                {
                    gatewayCalls++;

                    throw new InvalidOperationException(
                        "Gateway should not be called."
                    );
                }
            );

        var unitOfWork =
            new StubUnitOfWork();

        var handler =
            CreateHandler(
                orderRepository,
                paymentRepository,
                gateway,
                unitOfWork
            );

        var exception =
            await Assert.ThrowsAsync<InvalidOperationException>(
                () =>
                    handler.HandleAsync(
                        order.Id
                    )
            );

        Assert.Equal(
            "This order already has an active payment from another checkout flow.",
            exception.Message
        );

        Assert.Equal(
            0,
            gatewayCalls
        );
    }

    [Fact]
    public async Task RejectsInvalidOrderId()
    {
        var handler =
            CreateHandler(
                new StubOrderRepository(
                    NewOrder()
                ),
                new StubPaymentRepository(),
                new StubGateway(
                    (_, _) =>
                        throw new InvalidOperationException()
                ),
                new StubUnitOfWork()
            );

        await Assert.ThrowsAsync<ArgumentException>(
            () =>
                handler.HandleAsync(
                    0
                )
        );
    }

    private static CreateHostedCheckoutHandler CreateHandler(
        IOrderRepository orderRepository,
        IPaymentRepository paymentRepository,
        IHostedCheckoutGateway gateway,
        IUnitOfWork unitOfWork)
    {
        var prepare =
            new PrepareCheckoutPaymentHandler(
                orderRepository,
                paymentRepository
            );

        return new CreateHostedCheckoutHandler(
            prepare,
            paymentRepository,
            gateway,
            unitOfWork
        );
    }

    private static Order NewOrder()
    {
        var order =
            new Order(
                0,
                "pickup",
                "Cliente Teste",
                "11999990000",
                "cliente@teste.com",
                "52998224725"
            );

        order.AddItem(
            new OrderItem(
                1,
                1,
                43.90m
            )
        );

        typeof(Order)
            .GetProperty(nameof(Order.Id))!
            .SetValue(
                order,
                17
            );

        return order;
    }

    private sealed class StubGateway(
        Func<
            Payment,
            HostedCheckoutCustomer?,
            Task<HostedCheckoutSession>
        > getOrCreate)
        : IHostedCheckoutGateway
    {
        public Task<HostedCheckoutSession> GetOrCreateAsync(
            Payment payment,
            HostedCheckoutCustomer? customer,
            CancellationToken cancellationToken = default)
        {
            return getOrCreate(
                payment,
                customer
            );
        }
    }

    private sealed class StubUnitOfWork
        : IUnitOfWork
    {
        public List<StubTransaction> Transactions { get; } =
            [];

        public int ClearTrackingCalls { get; private set; }

        public int SaveChangesCalls { get; private set; }

        public Task<IUnitOfWorkTransaction> BeginTransactionAsync(
            CancellationToken cancellationToken = default)
        {
            var transaction =
                new StubTransaction();

            Transactions.Add(
                transaction
            );

            return Task.FromResult<IUnitOfWorkTransaction>(
                transaction
            );
        }

        public void ClearTracking()
        {
            ClearTrackingCalls++;
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            SaveChangesCalls++;

            return Task.CompletedTask;
        }
    }

    private sealed class StubTransaction
        : IUnitOfWorkTransaction
    {
        public bool Committed { get; private set; }

        public Task CommitAsync(
            CancellationToken cancellationToken = default)
        {
            Committed =
                true;

            return Task.CompletedTask;
        }

        public ValueTask DisposeAsync()
        {
            return ValueTask.CompletedTask;
        }
    }

    private sealed class StubOrderRepository(
        Order order)
        : IOrderRepository
    {
        public Task<Order?> GetByIdAsync(
            int orderId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult<Order?>(
                order.Id == orderId
                    ? order
                    : null
            );
        }

        public Task AddAsync(
            Order value,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }
    }

    private sealed class StubPaymentRepository
        : IPaymentRepository
    {
        public Payment? Payment { get; set; }

        public Task AddAsync(
            Payment payment,
            CancellationToken cancellationToken = default)
        {
            Payment =
                payment;

            typeof(Payment)
                .GetProperty(nameof(Payment.Id))!
                .SetValue(
                    payment,
                    31
                );

            return Task.CompletedTask;
        }

        public Task<Payment?> GetByIdAsync(
            int paymentId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(
                Payment?.Id == paymentId
                    ? Payment
                    : null
            );
        }

        public Task<Payment?> GetActiveByOrderIdAsync(
            int orderId,
            CancellationToken cancellationToken = default)
        {
            if (Payment is null ||
                Payment.OrderId != orderId)
            {
                return Task.FromResult<Payment?>(
                    null
                );
            }

            if (Payment.Status is not (
                    PaymentStatus.Pending or
                    PaymentStatus.Approved
                ))
            {
                return Task.FromResult<Payment?>(
                    null
                );
            }

            return Task.FromResult<Payment?>(
                Payment
            );
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }
    }
}