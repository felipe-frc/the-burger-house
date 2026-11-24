using System.Diagnostics;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Tests;

public sealed class OwnerRecoveryHostTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    [InlineData(null)]
    public async Task IsolatedHostLoadsPublishedServicesAndNeverChangesDataWithoutPrivateInput(bool? inspectOnly)
    {
        var directory = Path.Combine(Path.GetTempPath(), $"burger-owner-host-{Guid.NewGuid()}");
        Directory.CreateDirectory(directory);
        var database = Path.Combine(directory, "burgerhouse.db");
        var backup = Path.Combine(directory, "backup.db");
        var options = new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite($"Data Source={database}").Options;
        try
        {
            await using (var db = new BurgerHouseDbContext(options, TestPersonalData.Protector))
            {
                await db.Database.MigrateAsync();
                await new AdminIdentity(db).CreateFirstOwnerAsync("owner@example.invalid", $"Local-only-{Guid.NewGuid()}", default);
                db.Products.Add(new Product("historic", "Historic product", 19.9m));
                await db.SaveChangesAsync();
                await db.Database.OpenConnectionAsync();
                using var copy = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={backup}");
                copy.Open();
                ((Microsoft.Data.Sqlite.SqliteConnection)db.Database.GetDbConnection()).BackupDatabase(copy);
            }
            await using var baseline = new BurgerHouseDbContext(options, TestPersonalData.Protector);
            var hash = await baseline.Set<AdminUser>().AsNoTracking().Select(u => u.PasswordHash).SingleAsync();
            var migrations = (await baseline.Database.GetAppliedMigrationsAsync()).ToArray();
            // Only the two maintenance-host files are copied. All application
            // assemblies must resolve from the existing published root.
            var assembly = typeof(OwnerRecoveryHost.Entry).Assembly.Location;
            File.Copy(assembly, Path.Combine(directory, "OwnerRecoveryHost.dll"));
            File.Copy(Path.ChangeExtension(assembly, ".runtimeconfig.json"), Path.Combine(directory, "OwnerRecoveryHost.runtimeconfig.json"));
            var start = new ProcessStartInfo("dotnet") { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
            start.ArgumentList.Add(Path.Combine(directory, "OwnerRecoveryHost.dll"));
            start.ArgumentList.Add(AppContext.BaseDirectory);
            start.ArgumentList.Add(database);
            start.ArgumentList.Add(backup);
            if (inspectOnly.HasValue) start.ArgumentList.Add(inspectOnly.Value ? "--inspect-only" : "--reset-owner-password");
            using var process = Process.Start(start)!;
            process.StandardInput.Close();
            var stdout = process.StandardOutput.ReadToEndAsync();
            var stderr = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(30));
            var output = await stdout;
            var errors = await stderr;
            Assert.True(process.ExitCode == (inspectOnly == true ? 0 : 1), $"Host result: {process.ExitCode}; {output}; {errors}");
            if (inspectOnly.HasValue) Assert.Contains("preflight-ok", output);
            else Assert.DoesNotContain("preflight-ok", output);
            Assert.DoesNotContain("Unique password", output);
            Assert.Equal(hash, await baseline.Set<AdminUser>().AsNoTracking().Select(u => u.PasswordHash).SingleAsync());
            Assert.Equal(migrations, (await baseline.Database.GetAppliedMigrationsAsync()).ToArray());
            Assert.Equal("Historic product", (await baseline.Products.AsNoTracking().SingleAsync(p => p.Code == "historic")).Name);
        }
        finally
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            // This directory is a test-created unique temporary fixture only.
            if (Path.GetFileName(directory).StartsWith("burger-owner-host-", StringComparison.Ordinal)) Directory.Delete(directory, recursive: true);
        }
    }
}
