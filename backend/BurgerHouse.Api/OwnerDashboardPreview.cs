using Microsoft.Data.Sqlite;

namespace BurgerHouse.Api;

internal static class OwnerDashboardPreview
{
    internal static bool Validate(WebApplicationBuilder builder)
    {
        var root = builder.Configuration["OwnerDashboardPreview:Root"];
        if (root is null) return false;
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var urls = builder.Configuration["urls"];
        if (!builder.Environment.IsDevelopment() || !Path.IsPathFullyQualified(root) ||
            !Uri.TryCreate(urls, UriKind.Absolute, out var url) || url.Port < 1024 ||
            urls != $"http://127.0.0.1:{url.Port}" || builder.Configuration.GetSection("Kestrel:Endpoints").Exists())
            throw new InvalidOperationException("Owner preview requires Development and the local preview listener.");

        var directory = new DirectoryInfo(Path.GetFullPath(root));
        var database = Path.Combine(directory.FullName, "burgerhouse.homologation.db");
        var connection = new SqliteConnectionStringBuilder(builder.Configuration.GetConnectionString("DefaultConnection"));
        if (!directory.Name.StartsWith("burgerhouse-homologation-owner-test-", StringComparison.Ordinal) ||
            !string.Equals(directory.Parent?.FullName, Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath())), comparison) ||
            !directory.Exists || directory.Attributes.HasFlag(FileAttributes.ReparsePoint) ||
            !string.Equals(connection.DataSource, database, comparison) || connection.Mode != SqliteOpenMode.ReadWrite ||
            !File.Exists(database) || File.GetAttributes(database).HasFlag(FileAttributes.ReparsePoint))
            throw new InvalidOperationException("Owner preview requires a disposable local database.");
        return true;
    }
}
