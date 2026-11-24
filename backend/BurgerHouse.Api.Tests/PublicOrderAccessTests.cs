using BurgerHouse.Api.Security;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;

namespace BurgerHouse.Api.Tests;

public sealed class PublicOrderAccessTests
{
    [Fact]
    public void CapabilityIsBoundToOrderPurposeAndSevenDayReceiptLifetime()
    {
        var clock = new Clock();
        var provider = new EphemeralDataProtectionProvider();
        var access = new PublicOrderAccess(provider, clock);
        var token = access.Issue(42);
        Assert.True(access.TryRead(token, out var id));
        Assert.Equal(42, id);
        Assert.False(access.TryRead(token + "tampered", out _));
        Assert.False(access.TryRead(provider.CreateProtector("OtherPurpose").Protect("42:9999999999"), out _));
        Assert.False(new PublicOrderAccess(new EphemeralDataProtectionProvider(), clock).TryRead(token, out _));
        clock.Now = clock.Now.AddDays(7);
        Assert.False(access.TryRead(token, out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("malformed")]
    [InlineData("not-a-protected-capability!!!!")]
    public void MalformedProofFailsClosed(string? proof) =>
        Assert.False(new PublicOrderAccess(new EphemeralDataProtectionProvider(), new Clock()).TryRead(proof, out _));

    [Fact]
    public void DuplicateAndOversizedHeadersAreNotAccepted()
    {
        var access = new PublicOrderAccess(new EphemeralDataProtectionProvider(), new Clock());
        var token = access.Issue(42);
        var request = new DefaultHttpContext().Request;
        request.Headers[PublicOrderAccess.Header] = new StringValues([token, token]);
        Assert.False(access.TryRead(request, out _));
        request.Headers[PublicOrderAccess.Header] = new string('a', 2049);
        Assert.False(access.TryRead(request, out _));
    }

    [Theory]
    [InlineData("Checkout", "orderId")]
    [InlineData("Payments", "paymentId")]
    public async Task MissingProofCannotReachTheControllerOrDatabase(string controller, string argument)
    {
        var access = new PublicOrderAccess(new EphemeralDataProtectionProvider(), new Clock());
        // Unopened database: an accidental query would fail, as would executing the action.
        await using var db = new BurgerHouseDbContext(new DbContextOptionsBuilder<BurgerHouseDbContext>()
            .UseSqlite("Data Source=:memory:").Options, TestPersonalData.Protector);
        var route = new RouteData(); route.Values["controller"] = controller;
        var action = new ActionContext(new DefaultHttpContext(), route, new ActionDescriptor());
        var context = new ActionExecutingContext(action, [], new Dictionary<string, object?> { [argument] = 42 }, new object());
        await new PublicOrderAccessFilter(access, db).OnActionExecutionAsync(context,
            () => throw new InvalidOperationException("Unauthorized action executed."));
        Assert.IsType<NotFoundObjectResult>(context.Result);
    }
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = new(2026, 11, 22, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
