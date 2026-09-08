using System.Net.Http.Headers;

using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Application.Payments.CreatePayment;
using BurgerHouse.Application.Payments.ProcessCardPayment;
using BurgerHouse.Application.Payments.SynchronizePaymentStatus;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Repositories;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration
    .GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException(
        "Connection string 'DefaultConnection' was not found."
    );

builder.Services.AddDbContext<BurgerHouseDbContext>(options =>
    options.UseSqlite(connectionString)
);

builder.Services
    .AddOptions<MercadoPagoOptions>()
    .Bind(
        builder.Configuration.GetSection(
            MercadoPagoOptions.SectionName
        )
    )
    .Validate(
        options =>
            !string.IsNullOrWhiteSpace(options.AccessToken),
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
    .ValidateOnStart();

builder.Services.AddScoped<IProductRepository, ProductRepository>();
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
builder.Services.AddScoped<IPaymentRepository, PaymentRepository>();

builder.Services.AddScoped<CreateOrderHandler>();
builder.Services.AddScoped<CreatePaymentHandler>();
builder.Services.AddScoped<ProcessCardPaymentHandler>();
builder.Services.AddScoped<SynchronizePaymentStatusHandler>();

builder.Services.AddScoped<MercadoPagoWebhookSignatureValidator>();

builder.Services.AddHttpClient<MercadoPagoOrderLookup>(
    httpClient =>
    {
        httpClient.BaseAddress = new Uri(
            "https://api.mercadopago.com/"
        );

        httpClient.Timeout = TimeSpan.FromSeconds(15);

        httpClient.DefaultRequestHeaders.Accept.Add(
            new MediaTypeWithQualityHeaderValue(
                "application/json"
            )
        );
    }
);

builder.Services.AddHttpClient<IPaymentGateway, MercadoPagoPaymentGateway>(
    (serviceProvider, httpClient) =>
    {
        var mercadoPagoOptions = serviceProvider
            .GetRequiredService<IOptions<MercadoPagoOptions>>()
            .Value;

        httpClient.BaseAddress = new Uri(
            "https://api.mercadopago.com/"
        );

        httpClient.Timeout = TimeSpan.FromSeconds(15);

        httpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                mercadoPagoOptions.AccessToken
            );

        httpClient.DefaultRequestHeaders.Accept.Add(
            new MediaTypeWithQualityHeaderValue(
                "application/json"
            )
        );
    }
);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.MapControllers();

app.MapGet("/", () => Results.Ok(new
{
    application = "Burger House API",
    status = "Running"
}));

app.Run();