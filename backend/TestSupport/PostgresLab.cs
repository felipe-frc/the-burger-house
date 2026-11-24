using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

internal static class PostgresLab
{
    internal static string? Create()
    {
        var pgTest = Environment.GetEnvironmentVariable("TBH_POSTGRES_FLOW");
        if (string.IsNullOrEmpty(pgTest)) return null;
        var settings = new Npgsql.NpgsqlConnectionStringBuilder(pgTest);
        if (settings.Host != "127.0.0.1" || settings.Database != "tbh_migration_lab")
            throw new InvalidOperationException("Expected the loopback PostgreSQL migration lab.");
        settings.SearchPath = "flow_" + Guid.NewGuid().ToString("N");
        settings.Pooling = false; // Each case owns a different schema and connection string.
        using var connection = new Npgsql.NpgsqlConnection(settings.ConnectionString);
        connection.Open();
        using var create = new Npgsql.NpgsqlCommand("CREATE SCHEMA " + settings.SearchPath, connection);
        create.ExecuteNonQuery();
        var pgConnection = settings.ConnectionString;
        using var context = new PostgresContext(new DbContextOptionsBuilder<PostgresContext>()
            .UseNpgsql(pgConnection).Options, TestPersonalData.Protector);
        context.Database.Migrate();
        return pgConnection;
    }

    internal static PostgresContext Open(string connection) => new(
        new DbContextOptionsBuilder<PostgresContext>().UseNpgsql(connection).Options, TestPersonalData.Protector);
}
