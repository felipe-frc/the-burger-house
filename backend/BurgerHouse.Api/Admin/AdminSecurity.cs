using System.Security.Claims;
using System.Threading.RateLimiting;
using BurgerHouse.Application.Admin;
using BurgerHouse.Infrastructure.Admin;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using System.Net;

namespace BurgerHouse.Api.Admin;

public static class AdminSecurity
{
    public const string Scheme = "OwnerSession";
    public static IServiceCollection AddOwnerAdministration(this IServiceCollection services, IConfiguration configuration, bool development)
    {
        services.AddScoped<IAdminIdentity, AdminIdentity>();
        services.AddScoped<IAdminService, AdminService>();
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<AdminLoginProtection>();
        // Preserve restricted host trust (TLS may terminate before Linux/Kestrel).
        // The automatic cloud flag alone clears trust lists; never interpret that as trust-all.
        services.AddOptions<ForwardedHeadersOptions>().PostConfigure(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = configuration.GetValue<int?>("Admin:ForwardedHeaders:ForwardLimit") ?? 1;
            if (!options.KnownProxies.Contains(IPAddress.IPv6Loopback))
                options.KnownProxies.Add(IPAddress.IPv6Loopback);
            if (!options.KnownNetworks.Any(network => network.Contains(IPAddress.Loopback)))
                options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(IPAddress.Loopback, 8));
            if (configuration.GetValue<bool>("Admin:ForwardedHeaders:UseAzureAppServiceNetworks"))
            {
                // Opt-in deployment boundary: Kestrel must only be reachable through App Service ingress.
                // WEBSITE_* are process configuration, never request headers or proof of a client's identity.
                if (string.IsNullOrWhiteSpace(configuration["WEBSITE_INSTANCE_ID"]) ||
                    string.IsNullOrWhiteSpace(configuration["WEBSITE_SITE_NAME"]))
                    throw new InvalidOperationException("Azure App Service forwarding requires App Service hosting.");
                // Official App Service guidance; stable network ranges, not ephemeral proxy addresses.
                // https://learn.microsoft.com/azure/app-service/configure-language-dotnetcore#detect-https-session
                foreach (var (address, prefix) in new[] { ("10.0.0.0", 8), ("172.16.0.0", 12), ("192.168.0.0", 16) })
                {
                    var ip = IPAddress.Parse(address);
                    options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(ip, prefix));
                    options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(ip.MapToIPv6(), prefix + 96));
                }
            }
            foreach (var value in configuration.GetSection("Admin:ForwardedHeaders:KnownProxies").Get<string[]>() ?? [])
            {
                if (!IPAddress.TryParse(value, out var proxy) || proxy.Equals(IPAddress.Any) || proxy.Equals(IPAddress.IPv6Any))
                    throw new InvalidOperationException("Invalid trusted Admin proxy configuration.");
                options.KnownProxies.Add(proxy);
            }
            foreach (var value in configuration.GetSection("Admin:ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [])
            {
                if (!System.Net.IPNetwork.TryParse(value, out var network) || network.PrefixLength == 0)
                    throw new InvalidOperationException("Invalid trusted Admin proxy network configuration.");
                options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(network.BaseAddress, network.PrefixLength));
            }
        }).Validate(options => options.KnownProxies.All(proxy => !proxy.Equals(IPAddress.Any) && !proxy.Equals(IPAddress.IPv6Any)) &&
            options.KnownNetworks.All(network => network.PrefixLength > 0),
            "Admin forwarding cannot trust every proxy or network.")
        .Validate(options => options.ForwardLimit is >= 1 and <= 5,
            "Admin forwarding requires a finite hop limit between 1 and 5.").ValidateOnStart();
        var keys = services.AddDataProtection().SetApplicationName("TheBurgerHouse.Owner");
        var keyPath = configuration["Admin:DataProtectionPath"];
        if (!string.IsNullOrWhiteSpace(keyPath)) keys.PersistKeysToFileSystem(new DirectoryInfo(keyPath));
        services.AddAuthentication(Scheme).AddCookie(Scheme, options =>
        {
            options.Cookie.Name = "BurgerHouse.Owner";
            options.Cookie.Path = "/api/admin";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = development ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.ExpireTimeSpan = TimeSpan.FromHours(8);
            options.SlidingExpiration = false;
            options.Events = new CookieAuthenticationEvents
            {
                OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; },
                OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; },
                OnValidatePrincipal = async context =>
                {
                    var owner = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                    var session = context.Principal?.FindFirstValue("session");
                    var identity = context.HttpContext.RequestServices.GetRequiredService<IAdminIdentity>();
                    var clock = context.HttpContext.RequestServices.GetRequiredService<TimeProvider>();
                    if (!int.TryParse(owner, out var id) || session is null ||
                        !await identity.IsSessionValidAsync(id, session, clock.GetUtcNow().UtcDateTime, context.HttpContext.RequestAborted))
                        context.RejectPrincipal();
                }
            };
        });
        services.AddAuthorization(options => options.AddPolicy("Owner", policy =>
            policy.AddAuthenticationSchemes(Scheme).RequireAuthenticatedUser().RequireRole("Owner")));
        services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = "BurgerHouse.Csrf";
            options.Cookie.Path = "/api/admin";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = development ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        });
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = 429;
            options.AddPolicy("OwnerLogin", context => RateLimitPartition.GetFixedWindowLimiter(
                AdminLoginProtection.ClientAddress(context.Connection.RemoteIpAddress), _ => new()
            {
                PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true
            }));
        });
        return services;
    }
    public static async Task ProvisionOwnerAsync(IServiceProvider services)
    {
        if (Console.IsInputRedirected) throw new InvalidOperationException("Use an interactive private terminal to provision the Owner.");
        Console.Write("Owner email: ");
        var email = Console.ReadLine() ?? "";
        Console.Write("Unique password (14–128 characters; hidden): ");
        var password = new System.Text.StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(true);
            if (key.Key == ConsoleKey.Enter) break;
            if (key.Key == ConsoleKey.Backspace) { if (password.Length > 0) password.Length--; }
            else if (!char.IsControl(key.KeyChar) && password.Length < 129) password.Append(key.KeyChar);
        }
        Console.WriteLine();
        using var scope = services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IAdminIdentity>()
            .CreateFirstOwnerAsync(email, password.ToString(), CancellationToken.None);
        password.Clear();
        Console.WriteLine("Owner created. No HTTP server started.");
    }
}
