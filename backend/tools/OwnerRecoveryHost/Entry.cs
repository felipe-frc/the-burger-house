using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Runtime.Loader;
using System.Text.Json;
using BurgerHouse.Api.Admin;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Admin;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace OwnerRecoveryHost;

// Temporary maintenance host: loads the deployed implementation, never Program.Main.
// No migrations, SQL password changes, account creation or HTTP hosting code exists here.
public static class Entry
{
    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length != 4 || args[3] is not ("--inspect-only" or "--reset-owner-password"))
                throw new InvalidOperationException("An explicit --inspect-only or --reset-owner-password mode is required.");
            var published = Path.GetFullPath(args[0]);
            var database = Path.GetFullPath(args[1]);
            var backup = Path.GetFullPath(args[2]);
            if (!Directory.Exists(published) || !File.Exists(Path.Combine(published, "BurgerHouse.Api.dll")) || !File.Exists(database) || !File.Exists(backup) || database == backup)
                throw new InvalidOperationException("Existing application, database and distinct verified backup are required.");
            // Register before JIT-compiling code that references the deployed assemblies.
            AssemblyLoadContext.Default.Resolving += (_, name) =>
            {
                var file = Path.Combine(published, name.Name + ".dll");
                return File.Exists(file) ? AssemblyLoadContext.Default.LoadFromAssemblyPath(file) : null;
            };
            AssemblyLoadContext.Default.ResolvingUnmanagedDll += (_, name) =>
            {
                if (name != "e_sqlite3") return IntPtr.Zero;
                var files = OperatingSystem.IsWindows()
                    ? new[] { Path.Combine(published, "e_sqlite3.dll"), Path.Combine(published, "runtimes/win-x64/native/e_sqlite3.dll") }
                    : new[] { Path.Combine(published, "libe_sqlite3.so"), Path.Combine(published, "runtimes/linux-x64/native/libe_sqlite3.so") };
                foreach (var file in files)
                    if (File.Exists(file)) return NativeLibrary.Load(file);
                return IntPtr.Zero;
            };
            return await Run(published, database, backup, args[3] == "--inspect-only");
        }
        catch (Exception error)
        {
            // Do not print exception bodies/configuration or credential values.
            Console.Error.WriteLine($"RECOVERY_STOPPED ({error.GetType().Name}). No deployment, restart or migration was requested.");
            for (var detail = error; detail is not null; detail = detail.InnerException)
            {
                if (detail is TypeInitializationException type) Console.Error.WriteLine($"Initializer: {type.TypeName}");
                Console.Error.WriteLine($"Failure type: {detail.GetType().Name}");
            }
            return 1;
        }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static async Task<int> Run(string published, string database, string backup, bool inspectOnly)
    {
        // Recovery touches no encrypted customer columns. Refuse any accidental
        // access instead of reading/replacing the production encryption key.
        var protector = new NoPersonalDataAccess();
        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>()
            .UseSqlite(new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder { DataSource = database, Mode = inspectOnly ? Microsoft.Data.Sqlite.SqliteOpenMode.ReadOnly : Microsoft.Data.Sqlite.SqliteOpenMode.ReadWrite }.ToString()).Options;
        await using var db = new BurgerHouseDbContext(options, protector);
        var pending = (await db.Database.GetPendingMigrationsAsync()).ToArray();
        var owner = await db.Set<AdminUser>().AsNoTracking().Select(u => u.Id).ToArrayAsync();
        if (pending.Length != 0 || owner.Length != 1)
        {
            Console.WriteLine(JsonSerializer.Serialize(new { status = "blocked-preflight", pendingMigrations = pending, ownerCount = owner.Length, resetExecuted = false }));
            return 2;
        }
        await using var backupConnection = new Microsoft.Data.Sqlite.SqliteConnection(new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder { DataSource = backup, Mode = Microsoft.Data.Sqlite.SqliteOpenMode.ReadOnly }.ToString());
        await backupConnection.OpenAsync();
        await using var check = backupConnection.CreateCommand();
        check.CommandText = "PRAGMA quick_check";
        if (!Equals(await check.ExecuteScalarAsync(), "ok")) throw new InvalidOperationException("Backup check failed.");
        var before = await Counts(db);
        Console.WriteLine(JsonSerializer.Serialize(new { status = "preflight-ok", ownerId = owner[0], pendingMigrations = pending, database, backup, tableCounts = before, resetExecuted = false }));
        if (inspectOnly) return 0;
        if (Console.IsInputRedirected) throw new InvalidOperationException("An interactive private terminal is required.");
        var services = new ServiceCollection();
        services.AddScoped<IAdminIdentity>(_ => new AdminIdentity(db));
        await using var provider = services.BuildServiceProvider();
        // Exact official method from the deployed API: hidden entry, confirmation,
        // password validation, official identity service and session revocation.
        await AdminSecurity.ResetOwnerPasswordAsync(provider);
        var after = await Counts(db);
        var unchanged = before.Count == after.Count && before.All(p => after.TryGetValue(p.Key, out var count) && count == p.Value);
        Console.WriteLine(JsonSerializer.Serialize(new { status = unchanged ? "recovered" : "recovered-review-concurrent-data", ownerId = owner[0], resetExecuted = true, businessTableCountsUnchanged = unchanged, tableCounts = after }));
        return unchanged ? 0 : 3;
    }

    private static async Task<Dictionary<string, int>> Counts(BurgerHouseDbContext db) => new()
    {
        ["Products"] = await db.Products.CountAsync(), ["Orders"] = await db.Orders.CountAsync(),
        ["OrderItems"] = await db.OrderItems.CountAsync(), ["Payments"] = await db.Payments.CountAsync(),
        ["PaymentRefunds"] = await db.PaymentRefunds.CountAsync(), ["AdminAuditLogs"] = await db.AdminAuditLogs.CountAsync(),
        ["AdminUsers"] = await db.Set<AdminUser>().CountAsync()
    };

    private sealed class NoPersonalDataAccess : IPersonalDataProtector
    {
        public string? Protect(string? value, string purpose) => throw new InvalidOperationException("Recovery cannot write customer data.");
        public string? Unprotect(string? value, string purpose) => throw new InvalidOperationException("Recovery cannot read customer data.");
    }
}
