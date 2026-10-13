using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.ProcessPaymentWebhook;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Tests;

public class ProcessPaymentWebhookHandlerTests
{
    [Fact]
    public async Task PaidPixSynchronizesPaymentAndOrderAndCommits()
    {
        var store =
            new Store();

        var provider =
            new StubProviderLookup(
                new PaymentProviderSnapshot(
                    "CHAR_1",
                    $"payment:{store.Payment.Id}",
                    PaymentGatewayStatus.Approved,
                    "PAID",
                    PaymentMethod.Pix,
                    "PIX",
                    43.90m,
                    "BRL",
                    0
                )
            );

        var unitOfWork =
            new StubUnitOfWork();

        var handler =
            CreateHandler(
                store,
                provider,
                unitOfWork
            );

        var result =
            await handler.HandleAsync(
                CreateCommand(
                    store.Payment.Id
                )
            );

        Assert.True(
            result.Synchronized
        );

        Assert.Equal(
            PaymentStatus.Approved,
            store.Payment.Status
        );

        Assert.Equal(
            PaymentMethod.Pix,
            store.Payment.Method
        );

        Assert.Equal(
            "CHAR_1",
            store.Payment.ExternalPaymentId
        );

        Assert.Equal(
            OrderStatus.Received,
            store.Order.Status
        );

        Assert.Equal(
            1,
            provider.Calls
        );

        Assert.Single(
            unitOfWork.Transactions
        );

        Assert.True(
            unitOfWork.Transactions[0].Committed
        );

        Assert.Equal(
            1,
            unitOfWork.ClearTrackingCalls
        );
    }

    [Fact]
    public async Task DuplicateApprovedWebhookIsIdempotent()
    {
        var store =
            new Store();

        var provider =
            new StubProviderLookup(
                new PaymentProviderSnapshot(
                    "CHAR_1",
                    $"payment:{store.Payment.Id}",
                    PaymentGatewayStatus.Approved,
                    "PAID",
                    PaymentMethod.Pix,
                    "PIX",
                    43.90m,
                    "BRL",
                    0
                )
            );

        var unitOfWork =
            new StubUnitOfWork();

        var handler =
            CreateHandler(
                store,
                provider,
                unitOfWork
            );

        var first =
            await handler.HandleAsync(
                CreateCommand(
                    store.Payment.Id
                )
            );

        var second =
            await handler.HandleAsync(
                CreateCommand(
                    store.Payment.Id
                )
            );

        Assert.True(
            first.Synchronized
        );

        Assert.False(
            second.Synchronized
        );

        Assert.Equal(
            PaymentStatus.Approved,
            store.Payment.Status
        );

        Assert.Equal(
            OrderStatus.Received,
            store.Order.Status
        );

        Assert.Equal(
            2,
            provider.Calls
        );

        Assert.Equal(
            2,
            unitOfWork.Transactions.Count
        );

        Assert.All(
            unitOfWork.Transactions,
            transaction =>
                Assert.True(
                    transaction.Committed
                )
        );
    }

    [Fact]
    public async Task RejectsAmbiguousPaidChargesBeforeProviderLookup()
    {
        var store =
            new Store();

        var provider =
            new StubProviderLookup(
                null
            );

        var unitOfWork =
            new StubUnitOfWork();

        var handler =
            CreateHandler(
                store,
                provider,
                unitOfWork
            );

        var command =
            new ProcessPaymentWebhookCommand(
                "ORDE_1",
                $"payment:{store.Payment.Id}",
                [
                    CreateCharge(
                        store.Payment.Id,
                        "CHAR_1",
                        "PAID"
                    ),
                    CreateCharge(
                        store.Payment.Id,
                        "CHAR_2",
                        "PAID"
                    )
                ]
            );

        var exception =
            await Assert.ThrowsAsync<InvalidOperationException>(
                () =>
                    handler.HandleAsync(
                        command
                    )
            );

        Assert.Equal(
            "Webhook charge selection is incompatible.",
            exception.Message
        );

        Assert.Equal(
            0,
            provider.Calls
        );

        Assert.Empty(
            unitOfWork.Transactions
        );

        Assert.Equal(
            PaymentStatus.Pending,
            store.Payment.Status
        );

        Assert.Equal(
            OrderStatus.PendingPayment,
            store.Order.Status
        );
    }

    [Fact]
    public async Task ExistingExternalPaymentIdSelectsOnlyExactCharge()
    {
        var store =
            new Store();

        store.Payment.SetExternalPaymentId(
            "CHAR_bound"
        );

        var provider =
            new StubProviderLookup(
                new PaymentProviderSnapshot(
                    "CHAR_bound",
                    $"payment:{store.Payment.Id}",
                    PaymentGatewayStatus.Pending,
                    "WAITING",
                    PaymentMethod.Pix,
                    "PIX",
                    43.90m,
                    "BRL",
                    0
                )
            );

        var unitOfWork =
            new StubUnitOfWork();

        var handler =
            CreateHandler(
                store,
                provider,
                unitOfWork
            );

        var command =
            new ProcessPaymentWebhookCommand(
                "ORDE_1",
                $"payment:{store.Payment.Id}",
                [
                    CreateCharge(
                        store.Payment.Id,
                        "CHAR_other",
                        "PAID"
                    ),
                    CreateCharge(
                        store.Payment.Id,
                        "CHAR_bound",
                        "WAITING"
                    )
                ]
            );

        var result =
            await handler.HandleAsync(
                command
            );

        Assert.True(
            result.Synchronized
        );

        Assert.Equal(
            1,
            provider.Calls
        );

        Assert.Equal(
            "CHAR_bound",
            provider.LastExternalPaymentId
        );

        Assert.Equal(
            PaymentStatus.Pending,
            store.Payment.Status
        );

        Assert.Equal(
            PaymentMethod.Pix,
            store.Payment.Method
        );

        Assert.Equal(
            "CHAR_bound",
            store.Payment.ExternalPaymentId
        );

        Assert.Single(
            unitOfWork.Transactions
        );

        Assert.True(
            unitOfWork.Transactions[0].Committed
        );
    }

    [Fact]
    public async Task RejectsProviderCorrelationMismatchWithoutCommitting()
    {
        var store =
            new Store();

        var provider =
            new StubProviderLookup(
                new PaymentProviderSnapshot(
                    "CHAR_1",
                    "payment:999",
                    PaymentGatewayStatus.Approved,
                    "PAID",
                    PaymentMethod.Pix,
                    "PIX",
                    43.90m,
                    "BRL",
                    0
                )
            );

        var unitOfWork =
            new StubUnitOfWork();

        var handler =
            CreateHandler(
                store,
                provider,
                unitOfWork
            );

        var exception =
            await Assert.ThrowsAsync<InvalidOperationException>(
                () =>
                    handler.HandleAsync(
                        CreateCommand(
                            store.Payment.Id
                        )
                    )
            );

        Assert.Equal(
            "Payment reference is incompatible.",
            exception.Message
        );

        Assert.Empty(
            unitOfWork.Transactions
        );

        Assert.Equal(
            PaymentStatus.Pending,
            store.Payment.Status
        );

        Assert.Equal(
            OrderStatus.PendingPayment,
            store.Order.Status
        );
    }

    [Fact]
    public async Task RejectsPaidPaymentWithUnknownMethod()
    {
        var store =
            new Store();

        var provider =
            new StubProviderLookup(
                new PaymentProviderSnapshot(
                    "CHAR_1",
                    $"payment:{store.Payment.Id}",
                    PaymentGatewayStatus.Approved,
                    "PAID",
                    PaymentMethod.Unknown,
                    "BOLETO",
                    43.90m,
                    "BRL",
                    0
                )
            );

        var unitOfWork =
            new StubUnitOfWork();

        var handler =
            CreateHandler(
                store,
                provider,
                unitOfWork
            );

        var command =
            new ProcessPaymentWebhookCommand(
                "ORDE_1",
                $"payment:{store.Payment.Id}",
                [
                    new PaymentWebhookCharge(
                        "CHAR_1",
                        $"payment:{store.Payment.Id}",
                        "WAITING",
                        4390,
                        "BRL",
                        4390,
                        0,
                        "BOLETO",
                        null
                    )
                ]
            );

        var exception =
            await Assert.ThrowsAsync<InvalidOperationException>(
                () =>
                    handler.HandleAsync(
                        command
                    )
            );

        Assert.Equal(
            "Paid payment method is unsupported.",
            exception.Message
        );

        Assert.Empty(
            unitOfWork.Transactions
        );

        Assert.Equal(
            PaymentStatus.Pending,
            store.Payment.Status
        );

        Assert.Equal(
            OrderStatus.PendingPayment,
            store.Order.Status
        );
    }

    private static ProcessPaymentWebhookHandler CreateHandler(
        Store store,
        IPaymentProviderLookup providerLookup,
        IUnitOfWork unitOfWork)
    {
        var synchronizer =
            new SynchronizeCheckoutPaymentHandler(
                store,
                store
            );

        return new ProcessPaymentWebhookHandler(
            store,
            providerLookup,
            synchronizer,
            unitOfWork
        );
    }

    private static ProcessPaymentWebhookCommand CreateCommand(
        int paymentId)
    {
        return new ProcessPaymentWebhookCommand(
            "ORDE_1",
            $"payment:{paymentId}",
            [
                CreateCharge(
                    paymentId,
                    "CHAR_1",
                    "PAID"
                )
            ]
        );
    }

    private static PaymentWebhookCharge CreateCharge(
        int paymentId,
        string chargeId,
        string status)
    {
        return new PaymentWebhookCharge(
            chargeId,
            $"payment:{paymentId}",
            status,
            4390,
            "BRL",
            4390,
            0,
            "PIX",
            null
        );
    }

    private sealed class StubProviderLookup(
        PaymentProviderSnapshot? snapshot)
        : IPaymentProviderLookup
    {
        public int Calls { get; private set; }

        public string? LastExternalPaymentId { get; private set; }

        public Task<PaymentProviderSnapshot?> GetAsync(
            string externalPaymentId,
            CancellationToken cancellationToken = default)
        {
            Calls++;

            LastExternalPaymentId =
                externalPaymentId;

            return Task.FromResult(
                snapshot
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

    private sealed class Store
        : IPaymentRepository,
          IOrderRepository
    {
        public Order Order { get; }

        public Payment Payment { get; }

        public int Saves { get; private set; }

        public Store()
        {
            Order =
                new Order(
                    0,
                    "pickup",
                    "Cliente Teste",
                    "11999990000",
                    "cliente@teste.com",
                    "52998224725"
                );

            Order.AddItem(
                new OrderItem(
                    1,
                    1,
                    43.90m
                )
            );

            typeof(Order)
                .GetProperty(nameof(Order.Id))!
                .SetValue(
                    Order,
                    17
                );

            Payment =
                new Payment(
                    Order.Id,
                    Order.Total,
                    Guid.NewGuid().ToString("D"),
                    PaymentMethod.Unknown
                );

            typeof(Payment)
                .GetProperty(nameof(Payment.Id))!
                .SetValue(
                    Payment,
                    31
                );

            Payment.SetExternalCheckoutId(
                "CHEC_1"
            );
        }

        public Task AddAsync(
            Payment payment,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        Task IOrderRepository.AddAsync(
            Order order,
            CancellationToken cancellationToken)
        {
            throw new NotSupportedException();
        }

        public Task<Payment?> GetByIdAsync(
            int paymentId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult<Payment?>(
                Payment.Id == paymentId
                    ? Payment
                    : null
            );
        }

        Task<Order?> IOrderRepository.GetByIdAsync(
            int orderId,
            CancellationToken cancellationToken)
        {
            return Task.FromResult<Order?>(
                Order.Id == orderId
                    ? Order
                    : null
            );
        }

        public Task<Payment?> GetActiveByOrderIdAsync(
            int orderId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult<Payment?>(
                Payment.OrderId == orderId
                    ? Payment
                    : null
            );
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            Saves++;

            return Task.CompletedTask;
        }
    }
}