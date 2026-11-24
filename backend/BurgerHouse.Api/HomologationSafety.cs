using Microsoft.Data.Sqlite;
using BurgerHouse.Infrastructure.Payments.PagBank;

namespace BurgerHouse.Api;

/// <summary>Opt-in isolation boundary. Never changes the Production environment.</summary>
public static class HomologationSafety
{
    public static string EnvironmentId(string root)
    {
        var path = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        if (OperatingSystem.IsWindows()) path = path.ToLowerInvariant();
        return Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(path)));
    }

    public static void Validate(IConfiguration configuration)
    {
        var root = configuration["Homologation:Root"];
        if (string.IsNullOrWhiteSpace(root) || !Path.IsPathFullyQualified(root) ||
            !new DirectoryInfo(root).Name.StartsWith("burgerhouse-homologation-", StringComparison.Ordinal))
            throw new InvalidOperationException("Homologation requires its own explicitly named absolute directory.");
        if (configuration["Database:Provider"] == "PostgreSQL")
        {
            var pg = new Npgsql.NpgsqlConnectionStringBuilder(configuration.GetConnectionString("DefaultConnection"));
            bool isolated = pg.Database == "tbh_portfolio_dev" && pg.SearchPath == "public" ||
                pg.Database == "tbh_migration_lab" && pg.SearchPath != null &&
                System.Text.RegularExpressions.Regex.IsMatch(pg.SearchPath, @"\Aowner_[a-f0-9]{32}\z");
            if (pg.Host != "127.0.0.1" || !isolated)
                throw new InvalidOperationException("Owner homologation requires a dedicated loopback PostgreSQL schema.");
        }
        else ValidateSqlite(configuration, root);
        if (configuration.GetValue<bool>("Portfolio:Enabled"))
        {
            var pg = new Npgsql.NpgsqlConnectionStringBuilder(configuration.GetConnectionString("DefaultConnection"));
            if (configuration["Database:Provider"] != "PostgreSQL" || pg.Host != "127.0.0.1" ||
                pg.Database != "tbh_portfolio_dev" || pg.SearchPath != "public" || pg.Port != 55482 ||
                pg.Username != "tbh_portfolio_dev_role" ||
                configuration["PagBank:RedirectUrl"] != PagBankOptions.LocalPortfolioReturnUrl ||
                !string.IsNullOrWhiteSpace(configuration["PagBank:NotificationUrl"]) ||
                configuration["ASPNETCORE_URLS"] != "http://127.0.0.1:55484")
                throw new InvalidOperationException("Portfolio requires its explicit loopback API, PostgreSQL database and local sandbox return URL.");
        }
        else if (configuration.GetValue<bool>("PagBank:EnablePortfolioSandbox"))
            throw new InvalidOperationException("Portfolio sandbox requires explicit Portfolio mode.");
        ValidateProvider(configuration);
        Directory.CreateDirectory(Path.Combine(Path.GetFullPath(root), "product-images"));
    }

    private static void ValidateSqlite(IConfiguration configuration, string root)
    {
        var connection = new SqliteConnectionStringBuilder(configuration.GetConnectionString("DefaultConnection"));
        var expected = Path.Combine(Path.GetFullPath(root), "burgerhouse.homologation.db");
        if (!Path.IsPathFullyQualified(connection.DataSource) ||
            !string.Equals(Path.GetFullPath(connection.DataSource), expected, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal) ||
            connection.Mode != SqliteOpenMode.ReadWrite || !File.Exists(expected))
            throw new InvalidOperationException("Homologation can only open its pre-provisioned isolated database.");
    }

    private static void ValidateProvider(IConfiguration configuration)
    {
        var provider = configuration["PagBank:BaseUrl"];
        if (provider != PagBankOptions.SandboxOrigin)
            throw new InvalidOperationException("Homologation requires the exact PagBank sandbox origin.");
        if (configuration.GetValue<bool>("PagBank:AllowUnsignedSandboxWebhooks"))
            throw new InvalidOperationException("Homologation cannot approve unsigned payment notifications.");
        var redirect = configuration["PagBank:RedirectUrl"];
        var notification = configuration["PagBank:NotificationUrl"];
        if (redirect == PagBankOptions.LocalHomologationReturnUrl ||
            configuration.GetValue<bool>("Portfolio:Enabled") && redirect == PagBankOptions.LocalPortfolioReturnUrl)
        {
            if (!string.IsNullOrWhiteSpace(notification))
                throw new InvalidOperationException("Local Homologation checkout must omit notification URLs.");
        }
        else if (!IsPublicHomologationUrl(redirect) || !IsPublicHomologationUrl(notification))
            throw new InvalidOperationException("Homologation return/webhook URLs must be separate HTTPS endpoints.");

    }

    private static bool IsPublicHomologationUrl(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var url) &&
        url.Scheme == Uri.UriSchemeHttps && !url.IsLoopback &&
        string.IsNullOrEmpty(url.UserInfo) && string.IsNullOrEmpty(url.Query) && string.IsNullOrEmpty(url.Fragment) &&
        !url.Host.EndsWith("azurewebsites.net", StringComparison.OrdinalIgnoreCase) &&
        url.Host != "burger-shop-aiib.vercel.app";
}
