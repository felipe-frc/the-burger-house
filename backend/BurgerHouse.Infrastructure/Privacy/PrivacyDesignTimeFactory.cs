using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Npgsql;

namespace BurgerHouse.Infrastructure.Privacy;

// Script generation does not require a running database or an operational credential.
// Never called by API startup. Only the separate privacy history is targeted.
public sealed class PrivacyDesignTimeFactory : IDesignTimeDbContextFactory<PrivacyDbContext>
{
    public PrivacyDbContext CreateDbContext(string[] args)
    {
        var supplied = Environment.GetEnvironmentVariable("TBH_PRIVACY_MIGRATION_CONNECTION");
        if (!string.IsNullOrEmpty(supplied) && Environment.GetEnvironmentVariable("TBH_PRIVACY_SCHEMA_CHANGE_AUTHORIZED") != "YES")
            throw new InvalidOperationException("A real connection requires explicit authorization for the privacy schema operation.");
        NpgsqlConnectionStringBuilder settings;
        try { settings = new NpgsqlConnectionStringBuilder(supplied ?? "Host=127.0.0.1;Port=55482;Database=privacy_design_only;Username=unused"); }
        catch (ArgumentException) { throw new InvalidOperationException("Invalid private migration configuration."); }
        settings.IncludeErrorDetail = false;
        var options = new DbContextOptionsBuilder<PrivacyDbContext>().UseNpgsql(settings.ConnectionString,
            provider => provider.MigrationsHistoryTable("__PrivacyEFMigrationsHistory")).Options;
        return new PrivacyDbContext(options);
    }
}
