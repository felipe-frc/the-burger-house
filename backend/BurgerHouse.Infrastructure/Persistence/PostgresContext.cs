using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Privacy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Metadata;
using Npgsql;

namespace BurgerHouse.Infrastructure.Persistence;

public sealed class PostgresContext(DbContextOptions<PostgresContext> options, IPersonalDataProtector protector)
    : BurgerHouseDbContext(options, protector)
{
    public static void ValidateConnection(string connection, bool production)
    {
        var settings = new NpgsqlConnectionStringBuilder(connection);
        if (string.IsNullOrWhiteSpace(settings.Host) || string.IsNullOrWhiteSpace(settings.Database) ||
            (production && settings.SslMode != SslMode.VerifyFull) || settings.IncludeErrorDetail || settings.LogParameters)
            throw new InvalidOperationException("Configure a PostgreSQL host and database, verified production TLS, and private diagnostics.");
    }

    public void VerifyOperationalSchema()
    {
        Database.OpenConnection();
        try
        {
            using var cmd = Database.GetDbConnection().CreateCommand();
            cmd.CommandText = """
                SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=current_schema();
                SELECT c.relname,i.indisunique FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
                WHERE c.relnamespace=current_schema()::regnamespace AND i.indisvalid;
                """;
            using var reader = cmd.ExecuteReader();
            var columns = new HashSet<(string, string)>();
            while (reader.Read()) columns.Add((reader.GetString(0), reader.GetString(1)));
            reader.NextResult();
            var indexes = new HashSet<(string, bool)>();
            while (reader.Read()) indexes.Add((reader.GetString(0), reader.GetBoolean(1)));
            foreach (var table in Model.GetRelationalModel().Tables)
            {
                if (table.Columns.Any(c => !columns.Contains((table.Name, c.Name))) ||
                    table.Indexes.Any(i => !indexes.Contains((i.Name, i.IsUnique))))
                    throw new InvalidOperationException($"PostgreSQL schema differs from the expected columns or indexes for {table.Name}.");
            }
        }
        finally { Database.CloseConnection(); }
    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        // Earlier SQLite migrations retained this payment reference after it left the domain model.
        builder.Entity<Payment>().Property<string?>("ExternalOrderId").HasColumnType("text");
        builder.Entity<Payment>().HasIndex("ExternalOrderId").IsUnique();
        builder.Entity<PaymentRefund>().ToTable("PaymentRefunds", table =>
            table.HasCheckConstraint("CK_PaymentRefunds_PositiveAmount", "\"Amount\" > 0 AND \"CumulativeRefundedAmount\" >= \"Amount\""));
        builder.Entity<StockItem>().ToTable("StockItems", table =>
            table.HasCheckConstraint("CK_Stock_Balance", "\"Quantity\" >= 0 AND \"Minimum\" >= 0"));
    }
}

public sealed class PostgresDesignFactory : IDesignTimeDbContextFactory<PostgresContext>
{
    public PostgresContext CreateDbContext(string[] args) => new(
        new DbContextOptionsBuilder<PostgresContext>().UseNpgsql(
            Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? throw new InvalidOperationException("Set the PostgreSQL connection in the environment.")).Options,
        new AesGcmPersonalDataProtector(Environment.GetEnvironmentVariable("Privacy__EncryptionKey")));
}
