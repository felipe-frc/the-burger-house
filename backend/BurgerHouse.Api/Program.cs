using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;

using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Application.Payments.GetPaymentStatus;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;

using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;

using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

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

builder.Services.AddDbContext<
    BurgerHouseDbContext>(
    options =>
        options.UseSqlite(
            connectionString
        )
);

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

builder.Services
    .AddOptions<PagBankOptions>()
    .Bind(builder.Configuration.GetSection(PagBankOptions.SectionName))
    .Validate(options =>
        Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps,
        "PagBank base URL must be configured as HTTPS.")
    .Validate(options => !string.IsNullOrWhiteSpace(options.Token),
        "PagBank token was not configured.")
    .Validate(options =>
        Uri.TryCreate(options.RedirectUrl, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps && !uri.IsLoopback,
        "PagBank redirect URL must be a public HTTPS URL.")
    .Validate(options =>
        Uri.TryCreate(options.NotificationUrl, UriKind.Absolute, out var uri) &&
        uri.Scheme == Uri.UriSchemeHttps && !uri.IsLoopback,
        "PagBank notification URL must be a public HTTPS URL.")
    .ValidateOnStart();

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
    CreateOrderHandler>();

builder.Services.AddScoped<
    PrepareCheckoutPaymentHandler>();

builder.Services.AddScoped<
    GetPaymentStatusHandler>();

builder.Services.AddScoped<
    IPaymentReconciliationService,
    PagBankPaymentReconciliationService>();

builder.Services.AddScoped<
    SynchronizeCheckoutPaymentHandler>();

builder.Services.AddHttpClient<PagBankCheckoutService>(
    client => client.Timeout = TimeSpan.FromSeconds(15)
);

builder.Services.AddScoped<IHostedCheckoutGateway>(provider =>
    provider.GetRequiredService<PagBankCheckoutService>()
);

builder.Services.AddHttpClient<PagBankPaymentLookup>(
    client => client.Timeout = TimeSpan.FromSeconds(15)
);

builder.Services.AddHttpClient<PagBankWebhookSignatureValidator>(
    client => client.Timeout = TimeSpan.FromSeconds(15)
);

builder.Services.AddControllers();

builder.Services.AddOpenApi();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext =
        scope.ServiceProvider
            .GetRequiredService<BurgerHouseDbContext>();

    dbContext.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseCors(
    FrontendCorsPolicy
);

app.MapControllers();

app.MapGet("/", () =>
    Results.Ok(new
    {
        application = "Burger House API",
        status = "Running"
    })
);

app.Run();
