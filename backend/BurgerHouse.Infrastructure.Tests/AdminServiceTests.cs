using BurgerHouse.Application.Admin;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class AdminServiceTests : IAsyncLifetime
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private BurgerHouseDbContext db = null!;
    private AdminService service = null!;
    private static DateRange Today => DateRange.FromDates(DateRange.LocalToday(DateTime.UtcNow), DateRange.LocalToday(DateTime.UtcNow));
    public async Task InitializeAsync()
    {
        await connection.OpenAsync();
        db = new(new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(connection).Options);
        await db.Database.MigrateAsync();
        service = new(db);
    }
    public async Task DisposeAsync() { await db.DisposeAsync(); await connection.DisposeAsync(); }

    private async Task<Order> Seed(PaymentStatus status = PaymentStatus.Approved, string type = "pickup", decimal? cost = 10m)
    {
        var order = new Order(type == "delivery" ? 5 : 0, type, "Cliente Teste", "11999990000",
            "cliente@teste.com", "52998224725",
            type == "delivery" ? "38400-000" : null, type == "delivery" ? "Rua Teste" : null,
            type == "delivery" ? "10" : null, type == "delivery" ? "Centro" : null, type == "delivery" ? "Cidade" : null);
        order.AddItem(new OrderItem(1, 2, 30m, "Sem cebola", cost));
        db.Orders.Add(order); await db.SaveChangesAsync();
        var payment = new Payment(order.Id, order.Total, Guid.NewGuid().ToString(), PaymentMethod.Pix);
        switch (status)
        {
            case PaymentStatus.Rejected: payment.Reject(); break;
            case PaymentStatus.Cancelled: payment.Cancel(); break;
            case PaymentStatus.Pending: break;
            default:
                payment.Approve(); order.MarkAsReceived();
                if (status == PaymentStatus.Refunded) payment.Refund();
                if (status == PaymentStatus.PartiallyRefunded) payment.Refund(true);
                if (status == PaymentStatus.Refunded) payment.RecordRefundTotal(payment.Amount);
                if (status == PaymentStatus.PartiallyRefunded) payment.RecordRefundTotal(30m);
                if (status == PaymentStatus.ChargedBack) payment.ChargeBack();
                break;
        }
        db.Add(payment); await db.SaveChangesAsync(); return order;
    }

    [Theory]
    [InlineData(PaymentStatus.Pending)]
    [InlineData(PaymentStatus.Rejected)]
    [InlineData(PaymentStatus.Cancelled)]
    [InlineData(PaymentStatus.Refunded)]
    [InlineData(PaymentStatus.PartiallyRefunded)]
    [InlineData(PaymentStatus.ChargedBack)]
    public async Task SettledSalesRemainGrossRevenueAfterRefundOrChargeback(PaymentStatus excluded)
    {
        await Seed(); await Seed(excluded);
        var summary = await service.SummaryAsync(Today, default);
        var settled = excluded is PaymentStatus.Refunded or PaymentStatus.PartiallyRefunded or PaymentStatus.ChargedBack;
        Assert.Equal(settled ? 120 : 60, summary.GrossRevenue); Assert.Equal(settled ? 2 : 1, summary.PaidOrders);
        Assert.Equal(60, summary.AverageTicket); Assert.Equal(settled ? 80m : 40m, summary.GrossProfit);
        Assert.Equal(excluded == PaymentStatus.Refunded ? 60 : excluded == PaymentStatus.PartiallyRefunded ? 30 : 0, summary.RefundedAmount);
        Assert.Equal(summary.GrossRevenue - summary.RefundedAmount, summary.NetRevenue);
        Assert.Equal(excluded == PaymentStatus.PartiallyRefunded ? 1 : 0, summary.PartialRefunds);
        var transactions = await service.TransactionsAsync(Today, 1, default);
        Assert.Equal(2, transactions.Total);
    }
    [Fact]
    public async Task DashboardAggregatesCountsMethodsSeriesAndGrossProfitWithoutDeliveryFee()
    {
        await Seed(type: "delivery");
        var completed = await Seed();
        completed.AdvanceStatus(OrderStatus.Preparing); completed.AdvanceStatus(OrderStatus.ReadyForPickup);
        completed.AdvanceStatus(OrderStatus.Completed); await db.SaveChangesAsync();
        var dashboard = await service.DashboardAsync(DateTime.UtcNow, default);
        Assert.Equal(125, dashboard.Today.GrossRevenue); Assert.Equal(2, dashboard.Today.PaidOrders);
        Assert.Equal(62.5m, dashboard.Today.AverageTicket); Assert.Equal(1, dashboard.OpenOrders);
        Assert.Equal(1, dashboard.NewPaidOrders); Assert.Equal(80m, dashboard.Month.GrossProfit);
        var series = await service.RevenueAsync(Today, default);
        Assert.Equal(125, Assert.Single(series).Revenue);
        var method = Assert.Single(await service.MethodsAsync(Today, default));
        Assert.Equal("Pix", method.Method); Assert.Equal(100, method.Percentage); Assert.Equal(2, method.Count);
    }
    [Fact]
    public async Task HistoricalUnknownCostDoesNotInventProfitAndSnapshotSurvivesProductEdits()
    {
        await Seed(cost: null); await Seed(cost: 10);
        await service.UpdateProductAsync(1, 90, 80, true, default);
        var summary = await service.SummaryAsync(Today, default);
        Assert.Equal(2, summary.PaidOrders); Assert.Equal(1, summary.OrdersWithCost); Assert.Equal(40m, summary.GrossProfit);
        Assert.Contains(await db.OrderItems.ToListAsync(), i => i.UnitCost == 10m && i.UnitPrice == 30m);
    }
    [Fact]
    public async Task AllUnknownCostsHaveNullProfit()
    {
        await Seed(cost: null);
        Assert.Null((await service.SummaryAsync(Today, default)).GrossProfit);
    }
    [Fact]
    public async Task NewOrderHandlerCopiesCurrentCostAndNeverChangesExistingItems()
    {
        await service.UpdateProductAsync(1, 30, 12.5m, true, default);
        var handler = new CreateOrderHandler(new ProductRepository(db), new OrderRepository(db));
        await handler.HandleAsync(new CreateOrderRequest { OrderType = "pickup", CustomerName = "Cliente",
            CustomerEmail = "cliente@teste.com", CustomerTaxId = "52998224725",
            CustomerPhone = "11999990000", Items = [new() { ProductCode = "burger-praiano", Quantity = 1 }] });
        await service.UpdateProductAsync(1, 50, 20, true, default);
        db.ChangeTracker.Clear();
        var item = await db.OrderItems.SingleAsync();
        Assert.Equal(12.5m, item.UnitCost); Assert.Equal(30m, item.UnitPrice);
    }
    [Fact]
    public async Task OrdersFilterSearchSortPaginateAndDetailsDoNotExposeProviderFields()
    {
        for (var i = 0; i < 22; i++) await Seed(type: i == 0 ? "delivery" : "pickup");
        var page = await service.OrdersAsync(new(Sort: "oldest"), default);
        Assert.Equal(20, page.Items.Count); Assert.Equal(22, page.Total);
        Assert.Equal(2, (await service.OrdersAsync(new(Page: 2), default)).Items.Count);
        var match = await service.OrdersAsync(new(Search: "#" + page.Items[0].Id), default);
        var detail = await service.OrderAsync(Assert.Single(match.Items).Id, default);
        Assert.Equal("Rua Teste", detail!.Street); Assert.Equal("11999990000", detail.CustomerPhone);
        Assert.Single(detail.Items); Assert.Single(detail.Payments);
        Assert.Equal(22, (await service.OrdersAsync(new(Search: "cliente", Status: "Received"), default)).Total);
        Assert.Empty((await service.OrdersAsync(new(Status: "Preparing"), default)).Items);
        Assert.Null(await service.OrderAsync(999, default));
        var json = System.Text.Json.JsonSerializer.Serialize(detail);
        foreach (var forbidden in new[] { "PasswordHash", "IdempotencyKey", "ExternalPaymentId", "ExternalCheckoutId", "Token" })
            Assert.DoesNotContain(forbidden, json);
    }
    [Theory]
    [InlineData("delivery")]
    [InlineData("pickup")]
    public async Task OnlySequentialTransitionsForPaidOrders(string type)
    {
        var order = await Seed(type: type);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.AdvanceAsync(order.Id, OrderStatus.Received, OrderStatus.Completed, default));
        await service.AdvanceAsync(order.Id, OrderStatus.Received, OrderStatus.Preparing, default);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.AdvanceAsync(order.Id, OrderStatus.Received, OrderStatus.Preparing, default));
        await service.AdvanceAsync(order.Id, OrderStatus.Preparing, OrderStatus.ReadyForPickup, default);
        if (type == "delivery") await service.AdvanceAsync(order.Id, OrderStatus.ReadyForPickup, OrderStatus.OutForDelivery, default);
        await service.AdvanceAsync(order.Id, order.Status, OrderStatus.Completed, default);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.AdvanceAsync(order.Id, OrderStatus.Completed, OrderStatus.Received, default));
        var pending = await Seed(PaymentStatus.Pending);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.AdvanceAsync(pending.Id, OrderStatus.PendingPayment, OrderStatus.Received, default));
        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.AdvanceAsync(999, OrderStatus.Received, OrderStatus.Preparing, default));
    }
    [Theory]
    [InlineData(-1, 0)]
    [InlineData(0, 1)]
    [InlineData(1.111, 0)]
    [InlineData(1, -1)]
    [InlineData(1, 0.111)]
    public async Task ProductEditRejectsInvalidMoney(decimal price, decimal cost) =>
        await Assert.ThrowsAsync<ArgumentException>(() => service.UpdateProductAsync(1, price, cost, true, default));
    [Fact]
    public async Task ProductsExposeOnlyApprovedFieldsAndAllowUnknownCost()
    {
        await service.UpdateProductAsync(1, 33, 0, false, default);
        var product = (await service.ProductsAsync(default)).First();
        Assert.False(product.IsActive); Assert.Equal(33, product.Margin);
        await service.UpdateProductAsync(1, 33, null, true, default);
        Assert.Null((await service.ProductsAsync(default)).First().Margin);
        await Assert.ThrowsAsync<KeyNotFoundException>(() => service.UpdateProductAsync(999, 1, null, true, default));
    }
    [Fact]
    public async Task DateBoundariesExcludeFollowingDayAndSeriesFillsZeros()
    {
        await Seed();
        var yesterday = DateRange.LocalToday(DateTime.UtcNow).AddDays(-1);
        Assert.Equal(0, (await service.SummaryAsync(DateRange.FromDates(yesterday, yesterday), default)).GrossRevenue);
        var series = await service.RevenueAsync(DateRange.FromDates(yesterday, yesterday.AddDays(1)), default);
        Assert.Equal(2, series.Count); Assert.Equal(0, series[0].Revenue); Assert.Equal(60, series[1].Revenue);
        Assert.Throws<ArgumentException>(() => DateRange.FromDates(yesterday, yesterday.AddDays(367)));
        await Assert.ThrowsAsync<ArgumentException>(() => service.OrdersAsync(new(Page: 0), default));
        await Assert.ThrowsAsync<ArgumentException>(() => service.OrdersAsync(new(Status: "999"), default));
        await Assert.ThrowsAsync<ArgumentException>(() => service.OrdersAsync(new(Sort: "bad"), default));
    }
    [Fact]
    public async Task MigrationPreservesPreviousRecordsAndRollbackPreservesOrders()
    {
        await db.GetService<IMigrator>().MigrateAsync("20261004130831_AddOrderFulfillmentDetails");
        await db.Database.ExecuteSqlRawAsync("INSERT INTO Orders(Id,DeliveryFee,Status,CreatedAt,OrderType,CustomerName,CustomerPhone) VALUES(1,'5',1,'2026-10-01','delivery','Legacy','11999990000')");
        await db.Database.ExecuteSqlRawAsync("INSERT INTO OrderItems(OrderId,ProductId,Quantity,UnitPrice) VALUES(1,1,1,'43.9')");
        await db.Database.MigrateAsync();
        Assert.Null((await db.OrderItems.SingleAsync()).UnitCost);
        Assert.Null((await db.Products.FirstAsync()).CostPrice);
        Assert.Equal("Legacy", (await db.Orders.SingleAsync()).CustomerName);
        Assert.False(db.Database.HasPendingModelChanges());
        await db.GetService<IMigrator>().MigrateAsync("20261004130831_AddOrderFulfillmentDetails");
        Assert.Equal(1, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM Orders").SingleAsync());
        Assert.Equal(11, await db.Database.SqlQueryRaw<int>("SELECT COUNT(*) AS Value FROM Products").SingleAsync());
    }

    [Fact]
    public async Task NotificationsUseApprovalTimeAndKeysetPagingWithoutRepeatingOrders()
    {
        var baseline = await service.NotificationsAsync(null, DateTime.UtcNow, 0, default);
        Assert.Empty(baseline.Items);
        for (var i = 0; i < 52; i++) await Seed();
        await Seed(PaymentStatus.Pending);
        var batch = await service.NotificationsAsync(baseline.Until, DateTime.UtcNow, 0, default);
        Assert.Equal(52, batch.NewPaidOrders); Assert.Equal(50, batch.Items.Count); Assert.NotNull(batch.NextAfterId);
        var rest = await service.NotificationsAsync(baseline.Until, batch.Until, batch.NextAfterId.Value, default);
        Assert.Equal(2, rest.Items.Count); Assert.Null(rest.NextAfterId);
        Assert.Empty(rest.Items.Select(o => o.Id).Intersect(batch.Items.Select(o => o.Id)));
        Assert.Empty((await service.NotificationsAsync(batch.Until, DateTime.UtcNow, 0, default)).Items);
    }

    [Fact]
    public async Task ApprovalAndMultipleRefundDaysHaveIndependentFinancialPeriods()
    {
        await Seed();
        var payment = await db.Payments.SingleAsync();
        var approval = new DateTime(2026, 10, 1, 15, 0, 0, DateTimeKind.Utc);
        typeof(Payment).GetProperty(nameof(Payment.ApprovedAt))!.SetValue(payment, approval);
        payment.Refund(true);
        payment.RecordRefundTotal(30, approval.AddDays(4));
        payment.RecordRefundTotal(50, approval.AddDays(9));
        payment.Refund();
        payment.RecordRefundTotal(60, approval.AddDays(10));
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        DateRange Day(int day) => DateRange.FromDates(new(2026, 10, day), new(2026, 10, day));
        var sale = await service.SummaryAsync(Day(1), default);
        Assert.Equal(60, sale.GrossRevenue); Assert.Equal(0, sale.RefundedAmount); Assert.Equal(60, sale.NetRevenue);
        var refund = await service.SummaryAsync(Day(5), default);
        Assert.Equal(0, refund.GrossRevenue); Assert.Equal(30, refund.RefundedAmount); Assert.Equal(-30, refund.NetRevenue);
        Assert.Equal(20, (await service.SummaryAsync(Day(10), default)).RefundedAmount);
        var period = await service.SummaryAsync(DateRange.FromDates(new(2026, 10, 1), new(2026, 10, 10)), default);
        Assert.Equal(60, period.GrossRevenue); Assert.Equal(50, period.RefundedAmount); Assert.Equal(10, period.NetRevenue);
        Assert.Equal(1, period.PaidOrders); Assert.Equal(60, period.AverageTicket);
        Assert.Equal(60, Assert.Single(await service.RevenueAsync(Day(1), default)).Revenue);
        Assert.Equal(0, Assert.Single(await service.RevenueAsync(Day(11), default)).Revenue);
        Assert.Equal(60, Assert.Single(await service.MethodsAsync(Day(1), default)).Revenue);
    }

    [Fact]
    public async Task UnknownLegacyDatesAndOpeningRefundBalanceAreExplicitlyUndated()
    {
        await Seed(PaymentStatus.Approved);
        var payment = await db.Payments.SingleAsync();
        typeof(Payment).GetProperty(nameof(Payment.ApprovedAt))!.SetValue(payment, null);
        typeof(Payment).GetProperty(nameof(Payment.ApprovalDateSource))!.SetValue(payment, ApprovalDateSource.Unknown);
        typeof(Payment).GetProperty(nameof(Payment.RefundTrackingStartedAt))!.SetValue(payment, null);
        payment.Refund(true);
        await db.SaveChangesAsync();
        var before = await service.SummaryAsync(Today, default);
        Assert.Equal(1, before.UnknownApprovalPayments); Assert.Equal(1, before.UnreconstructedRefundPayments);
        payment.RecordRefundTotal(30);
        await db.SaveChangesAsync();
        var summary = await service.SummaryAsync(Today, default);
        Assert.Equal(0, summary.GrossRevenue); Assert.Equal(0, summary.RefundedAmount);
        Assert.Equal(30, summary.UndatedRefundBalance); Assert.Equal(0, summary.UnreconstructedRefundPayments);
        Assert.Empty(await db.PaymentRefunds.ToListAsync());
        Assert.Equal(0, (await service.DashboardAsync(DateTime.UtcNow, default)).Today.GrossRevenue);
    }
}
