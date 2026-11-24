using System.Globalization;
using System.Security.Cryptography;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Security;

/// <summary>A resource capability, separate from Owner authentication. Never put it in a URL.</summary>
public sealed class PublicOrderAccess(IDataProtectionProvider provider, TimeProvider clock)
{
    public const string Header = "X-Order-Access";
    private readonly IDataProtector protector = provider.CreateProtector("TheBurgerHouse.PublicOrderAccess.v1");

    public string Issue(int orderId) => protector.Protect(string.Create(CultureInfo.InvariantCulture,
        $"{orderId}:{clock.GetUtcNow().AddDays(7).ToUnixTimeSeconds()}"));

    public bool TryRead(string? token, out int orderId)
    {
        orderId = 0;
        if (token is null || token.Length is < 16 or > 2048) return false;
        try
        {
            var fields = protector.Unprotect(token).Split(':');
            return fields.Length == 2 && int.TryParse(fields[0], NumberStyles.None, CultureInfo.InvariantCulture, out orderId)
                && orderId > 0 && long.TryParse(fields[1], NumberStyles.None, CultureInfo.InvariantCulture, out var expiry)
                && expiry > clock.GetUtcNow().ToUnixTimeSeconds();
        }
        catch (Exception error) when (error is CryptographicException or FormatException or ArgumentException) { return false; }
    }

    public bool TryRead(HttpRequest request, out int orderId)
    {
        orderId = 0;
        var values = request.Headers[Header];
        return values.Count == 1 && TryRead(values[0], out orderId);
    }
}

public sealed class PublicOrderAccessFilter(PublicOrderAccess access, BurgerHouseDbContext db) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var controller = context.RouteData.Values["controller"]?.ToString();
        if (controller is "Orders" or "Checkout" or "Payments" or "Privacy" or "AdminPrivacy")
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store, private";
            context.HttpContext.Response.Headers["Referrer-Policy"] = "no-referrer";
            context.HttpContext.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        }
        if (controller is "Checkout" or "Payments")
        {
            var allowed = access.TryRead(context.HttpContext.Request, out var orderId);
            if (controller == "Checkout")
                allowed = allowed && context.ActionArguments.TryGetValue("orderId", out var requested) && requested is int id && id == orderId;
            else
                allowed = allowed && context.ActionArguments.TryGetValue("paymentId", out var requested) && requested is int paymentId
                    && await db.Payments.AsNoTracking().AnyAsync(p => p.Id == paymentId && p.OrderId == orderId, context.HttpContext.RequestAborted);
            if (!allowed)
            {
                // Identical response for absent, invalid, expired or another resource's proof.
                context.Result = new NotFoundObjectResult(new { error = "Compra não disponível para este comprovante de acesso." });
                return;
            }
        }

        var executed = await next();
        if (controller == "Orders" && executed.Result is ObjectResult { Value: CreateOrderResponse response, StatusCode: 201 })
            response.OrderAccessToken = access.Issue(response.OrderId);
    }
}
