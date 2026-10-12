using System.Net;
using System.Security.Cryptography;
using System.Text;
using BurgerHouse.Application.Admin;
using Microsoft.Extensions.Caching.Memory;

namespace BurgerHouse.Api.Admin;

// Process-local defense in depth. The independent IP limiter always applies first.
public sealed class AdminLoginProtection(TimeProvider clock) : IDisposable
{
    private readonly MemoryCache states = new(new MemoryCacheOptions { SizeLimit = 10_000 });
    private readonly byte[] key = RandomNumberGenerator.GetBytes(32);
    private readonly object gate = new();
    private static readonly TimeSpan Retention = TimeSpan.FromMinutes(30);

    public static string ClientAddress(IPAddress? address) =>
        address is null ? "unknown-peer" : (address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address).ToString();

    public async Task<OwnerIdentity?> AuthenticateAsync(IPAddress? address, string email,
        Func<Task<OwnerIdentity?>> authenticate, CancellationToken ct)
    {
        var identity = ClientAddress(address) + "\n" + email.Trim().ToUpperInvariant();
        var id = Convert.ToHexString(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(identity)));
        State state;
        lock (gate)
        {
            if (!states.TryGetValue(id, out State? existing))
            {
                // Bound memory even if many different account names are submitted.
                if (states.Count >= 10_000) states.Compact(0.1);
                existing = new State();
                states.Set(id, existing, new MemoryCacheEntryOptions { Size = 1, SlidingExpiration = Retention });
            }
            state = existing!;
        }
        // Serialize attempts for the same pair; parallel failures cannot bypass its cooldown.
        await state.Mutex.WaitAsync(ct);
        try
        {
            var now = clock.GetUtcNow();
            if (now - state.LastFailure >= Retention) state.Failures = 0;
            if (state.Failures > 0 && now < state.BlockedUntil) return null;
            var owner = await authenticate();
            if (owner is not null)
            {
                state.Failures = 0;
                state.BlockedUntil = default;
                return owner;
            }
            state.Failures = Math.Min(state.Failures + 1, 10);
            state.LastFailure = clock.GetUtcNow();
            var seconds = state.Failures < 5 ? 0 : Math.Min(60, 2 << (state.Failures - 5));
            state.BlockedUntil = state.LastFailure.AddSeconds(seconds);
            return null;
        }
        finally { state.Mutex.Release(); }
    }

    public void Dispose()
    {
        states.Dispose();
        CryptographicOperations.ZeroMemory(key);
    }

    private sealed class State
    {
        public SemaphoreSlim Mutex { get; } = new(1, 1);
        public int Failures { get; set; }
        public DateTimeOffset LastFailure { get; set; }
        public DateTimeOffset BlockedUntil { get; set; }
    }
}
