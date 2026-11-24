using System.Data.Common;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class ProductBatchTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(20)]
    public async Task BatchPreservesSingleLookupResultsWithConstantReadCount(int count)
    {
        // An optional PostgreSQL run creates its own schema in the guarded lab only.
        var pg = PostgresLab.Create();
        await using var sqlite = new SqliteConnection("Data Source=:memory:");
        await sqlite.OpenAsync();
        var counter = new Reads();
        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>();
        if (pg is null) options.UseSqlite(sqlite); else options.UseNpgsql(pg);
        options.AddInterceptors(counter);
        await using BurgerHouseDbContext db = pg is null
            ? new BurgerHouseDbContext(options.Options, TestPersonalData.Protector)
            : new PostgresContext(new DbContextOptionsBuilder<PostgresContext>()
                .UseNpgsql(pg).AddInterceptors(counter).Options, TestPersonalData.Protector);
        if (pg is null) await db.Database.MigrateAsync();
        var codes = Enumerable.Range(0, count).Select(i => $"batch-{i}").ToArray();
        db.Products.AddRange(codes.Select(code => Product.Create(code, code, "Synthetic", 12.34m, null, true)));
        db.Products.Add(Product.Create("inactive-batch", "Inactive", "Synthetic", 1m, null, false));
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var repository = new ProductRepository(db);
        var previous = new List<Product>();
        counter.Count = 0;
        foreach (var code in codes) previous.Add((await repository.GetByCodeAsync(code))!);
        Assert.Equal(count, counter.Count);
        counter.Count = 0;
        var current = await repository.GetByCodesAsync(codes);
        Assert.Equal(count == 0 ? 0 : 1, counter.Count);
        Assert.Equal(previous.Select(p => (p.Id, p.Code, p.Price)).OrderBy(p => p.Id),
            current.Select(p => (p.Id, p.Code, p.Price)).OrderBy(p => p.Id));
        Assert.Empty(db.ChangeTracker.Entries<Product>());

        counter.Count = 0;
        var mixed = await repository.GetByCodesAsync(codes.Select(c => " " + c + " ")
            .Concat(codes).Concat(["inactive-batch", "missing", " "]).ToArray());
        Assert.Equal(count, mixed.Count);
        Assert.Equal(1, counter.Count);
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            repository.GetByCodesAsync(["batch-0"], cancelled.Token));
    }

    private sealed class Reads : DbCommandInterceptor
    {
        public int Count { get; set; }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Count++;
            return ValueTask.FromResult(result);
        }
    }
}
