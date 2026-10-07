using System.Security.Claims;
using System.Threading.RateLimiting;
using BurgerHouse.Application.Admin;
using BurgerHouse.Infrastructure.Admin;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;

namespace BurgerHouse.Api.Admin;

public static class AdminSecurity
{
    public const string Scheme = "OwnerSession";
    public static IServiceCollection AddOwnerAdministration(this IServiceCollection services, IConfiguration configuration, bool development)
    {
        services.AddScoped<IAdminIdentity, AdminIdentity>();
        services.AddScoped<IAdminService, AdminService>();
        services.AddSingleton(TimeProvider.System);
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
            // Global partition intentionally does not trust caller-supplied proxy/IP headers.
            options.AddPolicy("OwnerLogin", _ => RateLimitPartition.GetFixedWindowLimiter("owner-login", _ => new()
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
