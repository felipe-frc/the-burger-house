using BurgerHouse.Api.Images;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Application.Payments.CreateHostedCheckout;
using BurgerHouse.Application.Payments.GetPaymentStatus;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using BurgerHouse.Application.Payments.ProcessPaymentWebhook;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;

using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;
using BurgerHouse.Infrastructure.Privacy;

using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection;

using BurgerHouse.Api.Admin;

if (Console.IsInputRedirected && (args.Contains("--reset-owner-password") || args.Contains("--update-owner-credentials") || args.Contains("--create-owner")))
    throw new InvalidOperationException("Use an interactive private terminal to manage the Owner.");

var builder = WebApplication.CreateBuilder(args);
var ownerPreview = BurgerHouse.Api.OwnerDashboardPreview.Validate(builder);

if (builder.Environment.IsEnvironment("Homologation"))
    BurgerHouse.Api.HomologationSafety.Validate(builder.Configuration);

using var sandboxProbe = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(15) };
var portfolioSandboxValidated = await BurgerHouse.Api.PortfolioSandbox.ValidateAsync(builder.Configuration, builder.Environment, sandboxProbe);
var portfolioOffline = builder.Configuration.GetValue<bool>("Portfolio:Enabled") && !portfolioSandboxValidated;

const string FrontendCorsPolicy = "Frontend";

var frontendOrigins =
    builder.Configuration
        .GetSection("Cors:AllowedOrigins")
        .Get<string[]>()?
        .Select(origin =>
            origin.Trim().TrimEnd('/')
        )
        .Where(origin =>
            Uri.TryCreate(
                origin,
                UriKind.Absolute,
                out var uri
            ) &&
            (uri.Scheme == Uri.UriSchemeHttp ||
             uri.Scheme == Uri.UriSchemeHttps)
        )
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray()
    ?? [];

if (builder.Environment.IsDevelopment())
{
    frontendOrigins = frontendOrigins
        .Concat(["http://localhost:5173", "http://localhost:3001", "http://127.0.0.1:3001"])
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();
}

if (frontendOrigins.Length == 0)
{
    throw new InvalidOperationException(
        "At least one CORS allowed origin must be configured."
    );
}

var connectionString =
    builder.Configuration
        .GetConnectionString(
            "DefaultConnection"
        )
    ?? throw new InvalidOperationException(
        "Connection string 'DefaultConnection' was not found."
    );

var legacyEnvironment = builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("IntegrationTest") ||
    builder.Environment.IsEnvironment("Homologation") || ownerPreview;
var postgres = !legacyEnvironment || builder.Configuration["Database:Provider"] == "PostgreSQL";
if (!postgres && (!builder.Environment.IsDevelopment() || ownerPreview))
{
    var sqlite = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(connectionString);
    if (sqlite.Mode == Microsoft.Data.Sqlite.SqliteOpenMode.ReadWriteCreate)
    {
        sqlite.Mode = Microsoft.Data.Sqlite.SqliteOpenMode.ReadWrite;
        connectionString = sqlite.ToString();
    }
}

// Resolve before migrations/startup; no plaintext-writing fallback when the key is missing.
builder.Services.AddSingleton<IPersonalDataProtector>(_ =>
    new AesGcmPersonalDataProtector(
        builder.Configuration["Privacy:EncryptionKey"]
    )
);

if (postgres)
{
    PostgresContext.ValidateConnection(connectionString, !legacyEnvironment);
    builder.Services.AddDbContext<PostgresContext>(options => options.UseNpgsql(connectionString));
    builder.Services.AddScoped<BurgerHouseDbContext>(services => services.GetRequiredService<PostgresContext>());
}
else
    builder.Services.AddDbContext<BurgerHouseDbContext>(options => options.UseSqlite(connectionString));

builder.Services.Configure<BurgerHouse.Api.Privacy.PrivacyOptions>(builder.Configuration.GetSection("Privacy"));
builder.Services.AddDbContext<PrivacyDbContext>((services, options) => {
    var connection = services.GetRequiredService<BurgerHouseDbContext>().Database.GetDbConnection();
    if (postgres) options.UseNpgsql(connection, provider => provider.MigrationsHistoryTable("__PrivacyEFMigrationsHistory"));
    else options.UseSqlite(connection, provider => provider.MigrationsHistoryTable("__PrivacyEFMigrationsHistory"));
});
builder.Services.AddScoped<BurgerHouse.Api.Privacy.PrivacyService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy(
        FrontendCorsPolicy,
        policy =>
        {
            policy
                .WithOrigins(frontendOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    );
});

var pagBankOptions = builder.Services
    .AddOptions<PagBankOptions>()
    .Bind(
        builder.Configuration.GetSection(
            PagBankOptions.SectionName
        )
    )
    .Validate(
        options =>
            Uri.TryCreate(
                options.BaseUrl,
                UriKind.Absolute,
                out var uri
            ) &&
            uri.Scheme == Uri.UriSchemeHttps,
        "PagBank base URL must be configured as HTTPS."
    )
    .Validate(
        options =>
            options.CheckoutExpirationMinutes > 0,
        "PagBank checkout expiration must be greater than zero."
    );

if (!builder.Environment.IsDevelopment())
{
    pagBankOptions
        .Validate(
            options =>
                !string.IsNullOrWhiteSpace(
                    options.Token
                ),
            "PagBank token was not configured."
        );
}

// HomologationSafety validates both URLs against the isolated environment's policy.
if (!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Homologation"))
{
    pagBankOptions
        .Validate(
            options =>
                Uri.TryCreate(
                    options.RedirectUrl,
                    UriKind.Absolute,
                    out var uri
                ) &&
                uri.Scheme == Uri.UriSchemeHttps &&
                !uri.IsLoopback,
            "PagBank redirect URL must be a public HTTPS URL."
        )
        .Validate(
            options =>
                Uri.TryCreate(
                    options.NotificationUrl,
                    UriKind.Absolute,
                    out var uri
                ) &&
                uri.Scheme == Uri.UriSchemeHttps &&
                !uri.IsLoopback,
            "PagBank notification URL must be a public HTTPS URL."
        );
}

pagBankOptions.ValidateOnStart();

builder.Services.AddScoped<
    BurgerHouse.Infrastructure.Translations.ProductTranslationCoordinator>();

builder.Services.AddScoped<
    BurgerHouse.Infrastructure.Translations.PendingProductTranslationBatch>();

if (!ownerPreview)
    builder.Services.AddHostedService<BurgerHouse.Api.AzureProductTranslationWorker>();

builder.Services.AddHttpClient<
    BurgerHouse.Application.Translations.IProductTranslationService,
    BurgerHouse.Infrastructure.Translations.AzureProductTranslationService>(
    client =>
        client.Timeout = TimeSpan.FromSeconds(30)
);

builder.Services.AddScoped<
    IProductRepository,
    ProductRepository>();

builder.Services.AddScoped<
    IOrderRepository,
    OrderRepository>();

builder.Services.AddScoped<
    IPaymentRepository,
    PaymentRepository>();

builder.Services.AddScoped<
    IUnitOfWork,
    EfUnitOfWork>();

builder.Services.AddScoped<
    IAuditLogWriter,
    EfAuditLogWriter>();

builder.Services.AddScoped<
    CreateOrderHandler>();

builder.Services.AddScoped<
    PrepareCheckoutPaymentHandler>();

builder.Services.AddScoped<
    CreateHostedCheckoutHandler>();

builder.Services.AddScoped<
    GetPaymentStatusHandler>();

builder.Services.AddScoped<
    ProcessPaymentWebhookHandler>();

builder.Services.AddScoped<
    IPaymentReconciliationService,
    PagBankPaymentReconciliationService>();

builder.Services.AddScoped<
    PendingPaymentReconciliationBatch>();

if (!ownerPreview && !portfolioOffline)
    builder.Services.AddHostedService<BurgerHouse.Api.PendingPaymentReconciliationWorker>();

builder.Services.AddScoped<
    PendingPaymentExpirationBatch>();

if (!ownerPreview && !portfolioOffline)
    builder.Services.AddHostedService<BurgerHouse.Api.PendingPaymentExpirationWorker>();

if (ownerPreview)
    builder.Services.ConfigureHttpClientDefaults(client => client.ConfigurePrimaryHttpMessageHandler(() =>
        new SocketsHttpHandler
        {
            ConnectCallback = (_, _) => ValueTask.FromException<Stream>(
                new HttpRequestException("Outbound HTTP is disabled in the Owner dashboard preview."))
        }));

builder.Services.AddScoped<
    SynchronizeCheckoutPaymentHandler>();

builder.Services.AddHttpClient<PagBankCheckoutService>(
    client =>
        client.Timeout =
            TimeSpan.FromSeconds(15)
);

builder.Services.AddScoped<IHostedCheckoutGateway>(
    provider =>
        provider.GetRequiredService<
            PagBankCheckoutService>()
);

builder.Services.AddHttpClient<PagBankPaymentLookup>(
    client =>
        client.Timeout =
            TimeSpan.FromSeconds(15)
);

builder.Services.AddScoped<IPaymentProviderLookup>(
    provider =>
        provider.GetRequiredService<
            PagBankPaymentLookup>()
);

builder.Services.AddHttpClient(
    PagBankWebhookSignatureValidator.HttpClientName,
    client =>
        client.Timeout =
            TimeSpan.FromSeconds(15)
);

builder.Services.AddSingleton<
    PagBankWebhookSignatureValidator>();

builder.Services.AddSingleton<BurgerHouse.Api.Security.PublicOrderAccess>();
builder.Services.AddControllersWithViews(options => options.Filters.Add<BurgerHouse.Api.Security.PublicOrderAccessFilter>());

builder.Services.AddOwnerAdministration(
    builder.Configuration,
    builder.Environment.IsDevelopment()
);
if (ownerPreview)
    builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();

builder.Services.AddSingleton(
    new ProductImageStorage(
        ownerPreview
            ? Path.Combine(builder.Configuration["OwnerDashboardPreview:Root"]!, "product-images")
        : builder.Environment.IsEnvironment("Homologation")
            ? Path.Combine(builder.Configuration["Homologation:Root"]!, "product-images")
            : ProductImageStorage.GetDefaultDirectory()
    )
);
builder.Services.AddScoped<ProductImageAssignmentService>();
builder.Services.AddOpenApi();

builder.Services.AddScoped<BurgerHouse.Infrastructure.Orders.OrderPricingService>();
var app = builder.Build();

// Password recovery must not run schema migrations as a side effect. It operates
// on the already provisioned database and exits without starting the HTTP host.
if (args.Contains("--reset-owner-password") || args.Contains("--update-owner-credentials"))
{
    await AdminSecurity.ResetOwnerPasswordAsync(app.Services, args.Contains("--update-owner-credentials"));
    return;
}

using (var scope = app.Services.CreateScope())
{
    var dbContext =
        scope.ServiceProvider
            .GetRequiredService<BurgerHouseDbContext>();

    if (postgres || ownerPreview || !app.Environment.IsDevelopment())
    {
        var expected = dbContext.Database.GetMigrations();
        var applied = dbContext.Database.GetAppliedMigrations();
        if (!expected.SequenceEqual(applied, StringComparer.Ordinal))
            throw new InvalidOperationException("Database migration history differs from this API. Review the schema before starting the service.");
        if (dbContext is PostgresContext pg) pg.VerifyOperationalSchema();
    }
    else dbContext.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (args.Contains("--create-owner"))
{
    await AdminSecurity.ProvisionOwnerAsync(
        app.Services
    );

    return;
}

// The host's automatic middleware runs before this pipeline. A UseWhen branch can
// otherwise register a second instance and consume another hop from the same headers.
if (!string.Equals(
        builder.Configuration["ForwardedHeaders_Enabled"],
        "true",
        StringComparison.OrdinalIgnoreCase
    ))
{
    // Without automatic forwarding, only Admin opts in; public routes are unchanged.
    app.UseWhen(
        context =>
            context.Request.Path.StartsWithSegments(
                "/api/admin"
            ),
        admin =>
            admin.UseForwardedHeaders()
    );
}

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();

app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        var headers = context.Response.Headers;
        headers.TryAdd("X-Content-Type-Options", "nosniff");
        headers.TryAdd("X-Frame-Options", "DENY");
        headers.TryAdd("Referrer-Policy", "no-referrer");
        headers.TryAdd("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
        return Task.CompletedTask;
    });
    await next();
});

app.UseCors(
    FrontendCorsPolicy
);

app.UseMiddleware<AdminErrorsMiddleware>();

if (ownerPreview)
    app.Use(async (context, next) =>
    {
        if (!context.Request.Path.StartsWithSegments("/api/admin") &&
            !context.Request.Path.StartsWithSegments("/api/product-images"))
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
        else await next();
    });

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();

if (app.Environment.IsEnvironment("Homologation"))
    app.MapGet("/api/homologation/info", () => Results.Ok(new {
        environment = "Homologation", isolated = true, sandbox = true,
        provider = postgres ? "PostgreSQL" : "SQLite",
        environmentId = BurgerHouse.Api.HomologationSafety.EnvironmentId(app.Configuration["Homologation:Root"]!),
        database = postgres ? new Npgsql.NpgsqlConnectionStringBuilder(connectionString).Database : "burgerhouse.homologation.db",
        localCheckout = app.Configuration["PagBank:RedirectUrl"] == PagBankOptions.LocalHomologationReturnUrl,
        portfolio = app.Configuration.GetValue<bool>("Portfolio:Enabled"),
        sandboxCredentialValidated = portfolioSandboxValidated,
        returnUrl = app.Configuration["PagBank:RedirectUrl"]
    }));

app.MapGet("/health/ready", async (BurgerHouseDbContext db, HttpContext http, CancellationToken ct) =>
{
    http.Response.Headers.CacheControl = "no-store";
    return await db.Database.CanConnectAsync(ct) ? Results.NoContent() : Results.StatusCode(503);
});

app.MapGet("/", () =>
    Results.Ok(
        new
        {
            application = "The Burger House API",
            status = "Running"
        }
    )
);

// Only the local supervisor owns this private stdin channel. No HTTP shutdown endpoint.
if (app.Environment.IsEnvironment("Homologation") && app.Configuration.GetValue<bool>("Portfolio:Supervised") && Console.IsInputRedirected)
    _ = Task.Run(async () => { if (await Console.In.ReadLineAsync() == "stop") app.Lifetime.StopApplication(); });
app.Run();

public partial class Program
{
}
