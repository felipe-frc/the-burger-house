using System.Net;
using BurgerHouse.Api.Admin;
using BurgerHouse.Application.Admin;

namespace BurgerHouse.Api.Tests;

public sealed class AdminLoginProtectionTests
{
    [Fact]
    public async Task FailureCooldownGrowsCapsExpiresAndDoesNotSlideOnBlockedAttempts()
    {
        var clock = new LoginClock();
        using var protection = new AdminLoginProtection(clock);
        var calls = 0;
        Task<OwnerIdentity?> Fail() { calls++; return Task.FromResult<OwnerIdentity?>(null); }
        var ip = IPAddress.Parse("203.0.113.10");
        for (var i = 0; i < 4; i++) await protection.AuthenticateAsync(ip, "owner@example.invalid", Fail, default);
        foreach (var seconds in new[] { 2, 4, 8, 16, 32, 60, 60 })
        {
            await protection.AuthenticateAsync(ip, "owner@example.invalid", Fail, default);
            var before = calls;
            clock.Advance(TimeSpan.FromSeconds(seconds - 1));
            await protection.AuthenticateAsync(ip, " OWNER@EXAMPLE.INVALID ", Fail, default);
            Assert.Equal(before, calls);
            clock.Advance(TimeSpan.FromSeconds(1));
        }
        clock.Advance(TimeSpan.FromMinutes(30));
        var previous = calls;
        await protection.AuthenticateAsync(ip, "owner@example.invalid", Fail, default);
        await protection.AuthenticateAsync(ip, "owner@example.invalid", Fail, default);
        Assert.Equal(previous + 2, calls);
    }

    [Fact]
    public async Task OtherAccountOrIpHasIndependentStateAndSuccessResetsOnlyItsPair()
    {
        var clock = new LoginClock();
        using var protection = new AdminLoginProtection(clock);
        var ip = IPAddress.Parse("203.0.113.10");
        var calls = 0;
        Task<OwnerIdentity?> Fail() { calls++; return Task.FromResult<OwnerIdentity?>(null); }
        Task<OwnerIdentity?> Success() => Task.FromResult<OwnerIdentity?>(new(1, "owner@example.invalid"));
        for (var i = 0; i < 5; i++) await protection.AuthenticateAsync(ip, "owner@example.invalid", Fail, default);
        Assert.NotNull(await protection.AuthenticateAsync(IPAddress.Parse("203.0.113.20"), "owner@example.invalid", Success, default));
        await protection.AuthenticateAsync(ip, "missing@example.invalid", Fail, default);
        Assert.Equal(6, calls);
        Assert.Null(await protection.AuthenticateAsync(ip.MapToIPv6(), " OWNER@EXAMPLE.INVALID ", Success, default));
        clock.Advance(TimeSpan.FromSeconds(2));
        Assert.NotNull(await protection.AuthenticateAsync(ip, "owner@example.invalid", Success, default));
        for (var i = 0; i < 4; i++) await protection.AuthenticateAsync(ip, "owner@example.invalid", Fail, default);
        Assert.NotNull(await protection.AuthenticateAsync(ip, "owner@example.invalid", Success, default));
    }

    [Fact]
    public async Task ConcurrentFailuresForOnePairCannotBypassCooldown()
    {
        using var protection = new AdminLoginProtection(new LoginClock());
        var calls = 0;
        async Task<OwnerIdentity?> Fail() { Interlocked.Increment(ref calls); await Task.Yield(); return null; }
        await Task.WhenAll(Enumerable.Range(0, 20).Select(_ =>
            protection.AuthenticateAsync(IPAddress.Loopback, "owner@example.invalid", Fail, default)));
        Assert.Equal(5, calls);
    }
}
