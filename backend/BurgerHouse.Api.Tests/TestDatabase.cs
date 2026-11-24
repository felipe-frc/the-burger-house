using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Tests;

internal static class TestDatabase
{
    public static void Prepare(string path)
    {
        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>()
            .UseSqlite($"Data Source={path};Pooling=False").Options;
        using var db = new BurgerHouseDbContext(options, TestPersonalData.Protector);
        db.Database.Migrate();
    }

    public static string? PrepareOperational(string database)
    {
        var pg = PostgresLab.Create();
        if (pg != null) return pg;
        Prepare(database);
        return null;
    }
}
