using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit.Abstractions;

namespace BurgerHouse.Api.Tests;

public sealed class OwnerOrderBurstTests(ITestOutputHelper output)
{
    [Theory]
    [InlineData(10, 10)]
    [InlineData(30, 10)]
    [InlineData(50, 50)]
    public async Task ConcurrentOrderWritesRemainVisibleInOwnerSnapshots(int size, int wave)
    {
        var path = Path.Combine(Path.GetTempPath(), $"burger-owner-burst-{Guid.NewGuid():N}.db");
        TestDatabase.Prepare(path);
        await using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("IntegrationTest");
            builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={path};Pooling=False");
            builder.UseSetting("Privacy:EncryptionKey", TestPersonalData.Key);
            builder.UseSetting("PagBank:Token", "test-only");
            builder.UseSetting("PagBank:BaseUrl", "https://api.invalid");
            builder.UseSetting("PagBank:RedirectUrl", "https://shop.example.invalid/menu");
            builder.UseSetting("PagBank:NotificationUrl", "https://api.invalid/webhook");
            builder.ConfigureLogging(logging => logging.ClearProviders());
        });
        try
        {
            using var client = app.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
            using (var scope = app.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
                db.Products.Add(new Product("owner-burst-burger", "Synthetic load burger", 43.9m));
                await db.SaveChangesAsync();
            }
            async Task<(int Id, int Http, double Ms)> Create(int index)
            {
                var start = Stopwatch.GetTimestamp();
                using var response = await client.PostAsJsonAsync("/api/orders", new
                {
                    orderType = "pickup",
                    customerName = $"Cliente Teste {index}",
                    customerPhone = "11999990000",
                    customerEmail = "cliente@example.com",
                    customerTaxId = "52998224725",
                    items = new[] { new { productCode = "owner-burst-burger", quantity = 1 } }
                });
                var elapsed = Stopwatch.GetElapsedTime(start).TotalMilliseconds;
                if (response.StatusCode != HttpStatusCode.Created) return (0, (int)response.StatusCode, elapsed);
                var body = await response.Content.ReadFromJsonAsync<JsonElement>();
                Assert.Equal(43.9m, body.GetProperty("total").GetDecimal());
                return (body.GetProperty("orderId").GetInt32(), (int)response.StatusCode, elapsed);
            }
            async Task<int> CountOrders()
            {
                using var scope = app.Services.CreateScope();
                return (await scope.ServiceProvider.GetRequiredService<IAdminService>()
                    .OrdersAsync(new OrderFilter(Status: "PendingPayment"), default)).Total;
            }

            var results = new List<(int Id, int Http, double Ms)>();
            using var process = Process.GetCurrentProcess();
            var cpu = process.TotalProcessorTime;
            var allocated = GC.GetTotalAllocatedBytes();
            for (var index = 0; index < size; index += wave)
            {
                var writes = Enumerable.Range(index, wave).Select(Create).ToArray();
                var snapshot = await CountOrders();
                Assert.InRange(snapshot, 0, index + wave);
                results.AddRange(await Task.WhenAll(writes));
            }
            var times = results.Select(result => result.Ms).Order().ToArray();
            output.WriteLine($"orders={size}; wave={wave}; errors={results.Count(x => x.Http != 201)}; p50={times[(int)Math.Ceiling(size * .5) - 1]:F1}ms; p95={times[(int)Math.Ceiling(size * .95) - 1]:F1}ms; test-process CPU={(process.TotalProcessorTime - cpu).TotalMilliseconds:F0}ms; managed allocations={(GC.GetTotalAllocatedBytes() - allocated) / 1048576d:F2}MiB");
            Assert.All(results, result => Assert.Equal(201, result.Http));
            Assert.Equal(size, results.Select(x => x.Id).Distinct().Count());
            Assert.Equal(size, await CountOrders());
            using var verification = app.Services.CreateScope();
            var saved = verification.ServiceProvider.GetRequiredService<BurgerHouseDbContext>();
            Assert.False(await saved.Payments.AnyAsync());
        }
        finally
        {
            await app.DisposeAsync();
            foreach (var file in new[] { path, path + "-wal", path + "-shm" }) File.Delete(file);
        }
    }
}
