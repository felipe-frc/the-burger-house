using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;

using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Application.Payments.GetPaymentStatus;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;

using BurgerHouse.Infrastructure.Payments.MercadoPago;
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
    .AddOptions<MercadoPagoOptions>()
    .Bind(
        builder.Configuration
            .GetSection(
                MercadoPagoOptions.SectionName
            )
    )
    .Validate(
        options =>
            !string.IsNullOrWhiteSpace(
                options.AccessToken
            ),
        "Mercado Pago access token was not configured."
    )
    .Validate(
        options =>
            !string.Equals(
                options.AccessToken.Trim(),
                "SEU_ACCESS_TOKEN",
                StringComparison.OrdinalIgnoreCase
            ),
        "Mercado Pago access token is still using the placeholder value."
    )
    .Validate(
        options =>
            !string.IsNullOrWhiteSpace(
                options.WebhookSecret
            ),
        "Mercado Pago webhook secret was not configured."
    )
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
    MercadoPagoWebhookSignatureValidator>();

builder.Services.AddHttpClient<MercadoPagoPreferenceService>(
    client =>
        client.Timeout = TimeSpan.FromSeconds(15)
);

builder.Services.AddScoped<
    SynchronizeCheckoutPaymentHandler>();

builder.Services.AddHttpClient<MercadoPagoPaymentLookup>(
    client =>
        client.Timeout = TimeSpan.FromSeconds(15)
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