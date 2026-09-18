using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Tests;

public class PrepareCheckoutPaymentHandlerTests
{
    [Fact]
    public async Task CreatesPersistedPendingUnknownAndReusesIt()
    {
        var store = new Store();
        var handler = new PrepareCheckoutPaymentHandler(store, store);
        var payment = await handler.HandleAsync(1);
        Assert.Equal(17, payment.Id);
        Assert.Equal(PaymentMethod.Unknown, payment.Method);
        Assert.Equal(PaymentStatus.Pending, payment.Status);
        Assert.Equal(43.90m, payment.Amount);
        Assert.Same(payment, await handler.HandleAsync(1));
        Assert.Equal(1, store.Saves);
    }

    [Theory]
    [InlineData(PaymentMethod.Pix)]
    [InlineData(PaymentMethod.CreditCard)]
    [InlineData(PaymentMethod.DebitCard)]
    public async Task RejectsActiveLegacyPayment(PaymentMethod method)
    {
        var store = new Store { Payment = new Payment(1, 43.90m, Guid.NewGuid().ToString("D"), method) };
        await Assert.ThrowsAsync<InvalidOperationException>(() => new PrepareCheckoutPaymentHandler(store, store).HandleAsync(1));
    }

    [Fact]
    public async Task ReusesCheckoutAfterMethodBecomesKnown()
    {
        var store = new Store();
        var handler = new PrepareCheckoutPaymentHandler(store, store);
        var payment = await handler.HandleAsync(1);
        payment.SetExternalPreferenceId("preference");
        payment.SetMethod(PaymentMethod.Pix);
        Assert.Same(payment, await handler.HandleAsync(1));
    }

    [Fact]
    public async Task RejectsMissingOrder()
    {
        var store = new Store();
        await Assert.ThrowsAsync<KeyNotFoundException>(() => new PrepareCheckoutPaymentHandler(store, store).HandleAsync(2));
    }

    [Fact]
    public async Task RejectsReceivedOrder()
    {
        var store = new Store();
        store.Order.MarkAsReceived();
        await Assert.ThrowsAsync<InvalidOperationException>(() => new PrepareCheckoutPaymentHandler(store, store).HandleAsync(1));
    }

    private sealed class Store : IOrderRepository, IPaymentRepository
    {
        public Order Order { get; } = new(0);
        public Payment? Payment { get; set; }
        public int Saves { get; private set; }
        public Store()
        {
            typeof(Order).GetProperty(nameof(Order.Id))!.SetValue(Order, 1);
            Order.AddItem(new OrderItem(1, 1, 43.90m));
        }
        public Task AddAsync(Order order, CancellationToken ct = default) => Task.CompletedTask;
        public Task AddAsync(Payment payment, CancellationToken ct = default) { Payment = payment; return Task.CompletedTask; }
        Task<Order?> IOrderRepository.GetByIdAsync(int id, CancellationToken ct) => Task.FromResult(id == 1 ? Order : null);
        Task<Payment?> IPaymentRepository.GetByIdAsync(int id, CancellationToken ct) => Task.FromResult(Payment?.Id == id ? Payment : null);


        public Task<Payment?> GetActiveByOrderIdAsync(int id, CancellationToken ct = default) => Task.FromResult(Payment);
        public Task SaveChangesAsync(CancellationToken ct = default)
        {
            Saves++;
            if (Payment is not null) typeof(Payment).GetProperty(nameof(Payment.Id))!.SetValue(Payment, 17);
            return Task.CompletedTask;
        }
    }
}
