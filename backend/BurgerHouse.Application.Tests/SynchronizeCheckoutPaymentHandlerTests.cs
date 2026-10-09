using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Tests;

public class SynchronizeCheckoutPaymentHandlerTests
{
    [Fact]
    public async Task RepeatedAndRegressiveSnapshotsPreserveDeltasAndApproval()
    {
        var store = new Store();
        var handler = new SynchronizeCheckoutPaymentHandler(store, store);
        Task<bool> Sync(PaymentGatewayStatus status, decimal total) =>
            handler.HandleAsync(17, "CHAR_1", 100, "BRL", PaymentMethod.Pix, status, refundedAmount: total);
        Assert.True(await Sync(PaymentGatewayStatus.Approved, 0));
        var approved = store.Payment.ApprovedAt;
        Assert.False(await Sync(PaymentGatewayStatus.Approved, 0));
        Assert.True(await Sync(PaymentGatewayStatus.PartiallyRefunded, 30));
        var updated = store.Payment.UpdatedAt;
        Assert.False(await Sync(PaymentGatewayStatus.PartiallyRefunded, 30));
        Assert.False(await Sync(PaymentGatewayStatus.PartiallyRefunded, 20));
        Assert.False(await Sync(PaymentGatewayStatus.Approved, 0));
        Assert.Equal(updated, store.Payment.UpdatedAt);
        Assert.True(await Sync(PaymentGatewayStatus.PartiallyRefunded, 50));
        Assert.True(await Sync(PaymentGatewayStatus.Refunded, 100));
        Assert.False(await Sync(PaymentGatewayStatus.Refunded, 100));
        Assert.Equal(new decimal[] { 30, 20, 50 }, store.Payment.Refunds.Select(r => r.Amount));
        Assert.Equal(approved, store.Payment.ApprovedAt);
        Assert.Equal(PaymentStatus.Refunded, store.Payment.Status);
        Assert.Equal(4, store.Saves);
    }

    [Theory]
    [InlineData(false, 30)]
    [InlineData(false, 100)]
    [InlineData(true, 30)]
    [InlineData(true, 100)]
    public async Task FirstRefundDistinguishesNewObservationFromLegacyOpeningBalance(bool legacy, decimal total)
    {
        var store = new Store();
        if (legacy) typeof(Payment).GetProperty(nameof(Payment.RefundTrackingStartedAt))!.SetValue(store.Payment, null);
        var handler = new SynchronizeCheckoutPaymentHandler(store, store);
        await handler.HandleAsync(17, "CHAR_1", 100, "BRL", PaymentMethod.Pix,
            total == 100 ? PaymentGatewayStatus.Refunded : PaymentGatewayStatus.PartiallyRefunded,
            refundedAmount: total);
        Assert.Equal(total, store.Payment.RefundedAmount);
        Assert.Equal(legacy ? 0 : 1, store.Payment.Refunds.Count);
        Assert.Equal(!legacy, store.Payment.ApprovedAt.HasValue);
        Assert.Equal(legacy ? ApprovalDateSource.Unknown : ApprovalDateSource.Observed, store.Payment.ApprovalDateSource);
    }

    private sealed class Store : IPaymentRepository, IOrderRepository
    {
        public Payment Payment { get; } = new(1, 100, Guid.NewGuid().ToString(), PaymentMethod.Unknown);
        private readonly Order order = new(0, "pickup", "Cliente", "11999990000", "cliente@teste.com", "52998224725");
        public int Saves { get; private set; }
        public Store()
        {
            typeof(Payment).GetProperty(nameof(Payment.Id))!.SetValue(Payment, 17);
            typeof(Order).GetProperty(nameof(Order.Id))!.SetValue(order, 1);
            order.AddItem(new OrderItem(1, 1, 100));
            Payment.SetExternalCheckoutId("CHEC_1");
        }
        public Task AddAsync(Payment payment, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task AddAsync(Order value, CancellationToken cancellationToken = default) => Task.CompletedTask;
        Task<Payment?> IPaymentRepository.GetByIdAsync(int id, CancellationToken ct) => Task.FromResult<Payment?>(Payment);
        Task<Order?> IOrderRepository.GetByIdAsync(int id, CancellationToken ct) => Task.FromResult<Order?>(order);
        public Task<Payment?> GetActiveByOrderIdAsync(int id, CancellationToken cancellationToken = default) => Task.FromResult<Payment?>(Payment);
        public Task SaveChangesAsync(CancellationToken cancellationToken = default) { Saves++; return Task.CompletedTask; }
    }
}
