using BurgerHouse.Application.Admin;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Orders;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class OrderPricingTests : IDisposable
{
    private readonly SqliteConnection sqlite = new("Data Source=:memory:");
    private readonly string? pg = PostgresLab.Create();
    private readonly BurgerHouseDbContext db;
    private readonly OrderPricingService pricing;

    public OrderPricingTests()
    {
        sqlite.Open();
        db = pg != null ? PostgresLab.Open(pg) : new BurgerHouseDbContext(
            new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(sqlite).Options, TestPersonalData.Protector);
        if (pg == null) db.Database.Migrate();
        db.Products.Add(Product.Create("pricing-burger", "Burger", "Receita", 34.90m, null, true));
        var drink = Product.Create("pricing-drink", "Bebida", "Bebida", 5.90m, null, true);
        drink.UpdateClassification("drinks", 1);
        db.Products.Add(drink);
        db.Add(new AddonOption { Code = "extra-cheese", Name = "Cheddar", Price = 4.50m, MaximumQuantity = 3, IsActive = true });
        db.Add(new Coupon { Code = "BURGERTESTE10", Percentage = 10, MinimumSubtotal = 30,
            StartsAt = DateTime.UtcNow.AddMinutes(-1), ExpiresAt = DateTime.UtcNow.AddDays(30), UsageLimit = 100, IsActive = true });
        db.SaveChanges();
        pricing = new(db, TimeProvider.System);
    }

    private static CreateOrderRequest Request(string? coupon = "BURGERTESTE10", string code = "extra-cheese", int quantity = 1,
        string product = "pricing-burger", string orderType = "delivery") => new()
    {
        OrderType = orderType, CustomerName = "Cliente sintético", CustomerPhone = "11999990000",
        CustomerEmail = "pricing@example.invalid", CustomerTaxId = "52998224725",
        ZipCode = "38400-000", Street = "Rua Teste", HouseNumber = "10", Neighborhood = "Centro", City = "Uberlândia",
        CouponCode = coupon, Items = [new() { ProductCode = product, Quantity = 1,
            Observation = "Sem cebola", Extras = [new(code, quantity)] }]
    };

    [Fact]
    public async Task ExtrasCouponAndFreightArePersistedAndReconcileWithFinance()
    {
        var quote = await pricing.QuoteAsync(Request(), default);
        Assert.Equal(39.40m, quote.Subtotal);
        Assert.Equal(3.94m, quote.Discount);
        Assert.Equal(40.46m, quote.Total);
        var response = await pricing.CreateAsync(Request(), default);
        db.ChangeTracker.Clear();
        var order = await db.Orders.Include(x => x.Items).SingleAsync(x => x.Id == response.OrderId);
        Assert.Equal(quote.Total, order.Total);
        Assert.Equal(3.94m, Assert.Single(order.Items).DiscountAmount);
        Assert.Contains("Cheddar", Assert.Single(order.Items).Observation);
        Assert.Contains("extra-cheese", Assert.Single(order.Items).ExtrasJson);
        var payment = new Payment(order.Id, order.Total, Guid.NewGuid().ToString(), BurgerHouse.Domain.Enums.PaymentMethod.Pix);
        payment.Approve();
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        var today = DateRange.LocalToday(DateTime.UtcNow);
        var finance = new AdminService(db);
        var summary = await finance.SummaryAsync(DateRange.FromDates(today, today), default);
        Assert.Equal(order.Total, summary.GrossRevenue);
        var categories = await finance.CategoryRevenueAsync(DateRange.FromDates(today, today), default);
        Assert.Contains("35.46", System.Text.Json.JsonSerializer.Serialize(categories));
        await pricing.ValidateCheckoutAsync(order.Id, default);
    }

    [Theory]
    [InlineData("unknown", 1, "pricing-burger")]
    [InlineData("extra-cheese", 4, "pricing-burger")]
    [InlineData("extra-cheese", 0, "pricing-burger")]
    [InlineData("extra-cheese", 1, "pricing-drink")]
    public async Task InvalidOrIncompatibleExtrasCannotCreateOrders(string code, int quantity, string product)
    {
        await Assert.ThrowsAsync<ArgumentException>(() => pricing.CreateAsync(Request(code: code, quantity: quantity, product: product), default));
        Assert.Empty(await db.Orders.ToListAsync());
        Assert.Equal(0, (await db.Set<Coupon>().AsNoTracking().SingleAsync()).UsedCount);
    }

    [Fact]
    public async Task InvalidExpiredInactiveMinimumAndExhaustedCouponsAreRejected()
    {
        await Assert.ThrowsAsync<ArgumentException>(() => pricing.QuoteAsync(Request("INVALID"), default));
        var coupon = await db.Set<Coupon>().SingleAsync();
        coupon.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => pricing.QuoteAsync(Request(), default));
        coupon.ExpiresAt = DateTime.UtcNow.AddDays(1);
        coupon.IsActive = false;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => pricing.QuoteAsync(Request(), default));
        coupon.IsActive = true;
        coupon.MinimumSubtotal = 100;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => pricing.QuoteAsync(Request(), default));
        coupon.MinimumSubtotal = 0;
        coupon.UsedCount = coupon.UsageLimit;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => pricing.QuoteAsync(Request(), default));
    }

    [Fact]
    public async Task FixedDiscountIsCappedAtEligibleItemsAndCannotDiscountFreight()
    {
        var coupon = await db.Set<Coupon>().SingleAsync();
        coupon.Percentage = 0;
        coupon.FixedAmount = 200;
        await db.SaveChangesAsync();
        var quote = await pricing.QuoteAsync(Request(), default);
        Assert.Equal(39.4m, quote.Discount);
        Assert.Equal(5m, quote.Total);
        coupon.ProductCategory = "drinks";
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => pricing.QuoteAsync(Request(), default));
    }

    [Fact]
    public async Task FailedOrderValidationRollsBackCouponReservation()
    {
        var invalid = new CreateOrderRequest { CouponCode = "BURGERTESTE10", OrderType = "pickup", Items = Request().Items };
        await Assert.ThrowsAsync<ArgumentException>(() => pricing.CreateAsync(invalid, default));
        Assert.Equal(0, (await db.Set<Coupon>().AsNoTracking().SingleAsync()).UsedCount);
    }

    [Fact]
    public async Task CouponIsRevalidatedBeforeCheckoutAndFreightIsNeverDiscounted()
    {
        var pickup = await pricing.QuoteAsync(Request(orderType: "pickup"), default);
        var delivery = await pricing.QuoteAsync(Request(), default);
        Assert.Equal(5, delivery.Total - pickup.Total);
        var order = await pricing.CreateAsync(Request(), default);
        var coupon = await db.Set<Coupon>().SingleAsync();
        coupon.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => pricing.ValidateCheckoutAsync(order.OrderId, default));
    }

    [Fact]
    public async Task LastCouponUseIsReservedAtomicallyBetweenOperators()
    {
        await db.Set<Coupon>().ExecuteUpdateAsync(x => x.SetProperty(c => c.UsageLimit, 1));
        async Task<bool> Attempt()
        {
            if (pg == null)
            {
                try { await pricing.CreateAsync(Request(), default); return true; }
                catch (ArgumentException) { return false; }
            }
            await using var other = PostgresLab.Open(pg);
            try { await new OrderPricingService(other, TimeProvider.System).CreateAsync(Request(), default); return true; }
            catch (ArgumentException) { return false; }
        }
        var results = pg == null ? new[] { await Attempt(), await Attempt() } : await Task.WhenAll(Attempt(), Attempt());
        Assert.Single(results, x => x);
        Assert.Equal(1, (await db.Set<Coupon>().AsNoTracking().SingleAsync()).UsedCount);
        Assert.Single(await db.Orders.ToListAsync());
    }

    public void Dispose() { db.Dispose(); sqlite.Dispose(); }
}
