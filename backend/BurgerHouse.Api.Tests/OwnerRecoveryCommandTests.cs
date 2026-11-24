using System.Diagnostics;

namespace BurgerHouse.Api.Tests;

public sealed class OwnerRecoveryCommandTests
{
    [Theory]
    [InlineData("--reset-owner-password")]
    [InlineData("--update-owner-credentials")]
    public async Task NonInteractiveRecoveryDoesNotCreateOrMigrateADatabase(string command)
    {
        var database = Path.Combine(Path.GetTempPath(), $"burger-recovery-{Guid.NewGuid()}.db");
        var start = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = AppContext.BaseDirectory,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        start.ArgumentList.Add(typeof(Program).Assembly.Location);
        start.ArgumentList.Add(command);
        start.Environment["ConnectionStrings__DefaultConnection"] = $"Data Source={database}";
        start.Environment["Privacy__EncryptionKey"] = TestPersonalData.Key;
        start.Environment["Cors__AllowedOrigins__0"] = "https://store.example.invalid";
        start.Environment["ASPNETCORE_ENVIRONMENT"] = "Production";
        using var process = Process.Start(start)!;
        process.StandardInput.Close();
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        try
        {
            // A cold Windows host may start slowly while the full suite creates
            // several API factories. The security assertion remains unchanged.
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(60));
            Assert.NotEqual(0, process.ExitCode);
            Assert.Contains("interactive private terminal", await output + await error);
            Assert.False(File.Exists(database), "Password recovery must never auto-create or migrate a production database.");
        }
        finally
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync();
            }
        }
    }
}
