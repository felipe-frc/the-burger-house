using System.Net;
using System.Net.Http.Headers;
using BurgerHouse.Infrastructure.Payments.PagBank;

namespace BurgerHouse.Api;

/// <summary>Explicit local-only payment capability; never enabled by a browser flag.</summary>
public static class PortfolioSandbox
{
    public static async Task<bool> ValidateAsync(IConfiguration configuration, IHostEnvironment environment,
        HttpClient client, CancellationToken ct = default)
    {
        var portfolio = configuration.GetValue<bool>("Portfolio:Enabled");
        var enabled = configuration.GetValue<bool>("PagBank:EnablePortfolioSandbox");
        if (!portfolio && !enabled) return false;
        if (!environment.IsEnvironment("Homologation"))
            throw new InvalidOperationException("Portfolio sandbox cannot run outside Homologation.");
        HomologationSafety.Validate(configuration);
        if (!enabled) return false;
        var token = configuration["PagBank:Token"];
        if (string.IsNullOrWhiteSpace(token) || token.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '.' or '_' or '~' or '+' or '/' or '=')))
            throw new InvalidOperationException("A private sandbox credential is required.");
        using var request = new HttpRequestMessage(HttpMethod.Get,
            PagBankOptions.SandboxOrigin + "/checkouts/CHEC_" + Guid.NewGuid().ToString());
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        // A fresh nonexistent identifier proves authenticated access without creating any payment.
        if (response.StatusCode != HttpStatusCode.NotFound)
            throw new InvalidOperationException($"Sandbox credential validation failed (HTTP {(int)response.StatusCode}).");
        return true;
    }
}
