using System.ComponentModel.DataAnnotations;
using System.Globalization;
using BurgerHouse.Application.Admin;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController, Route("api/admin"), Authorize(Policy = "Owner"), AutoValidateAntiforgeryToken]
public sealed class AdminController(IAdminService service, TimeProvider clock) : ControllerBase
{
    [HttpGet("dashboard")]
    public Task<Dashboard> Dashboard(CancellationToken ct) => service.DashboardAsync(clock.GetUtcNow().UtcDateTime, ct);
    [HttpGet("notifications")]
    public Task<NotificationBatch> Notifications(DateTime? since = null, DateTime? until = null, int afterId = 0, CancellationToken ct = default)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        if (until > now) throw new ArgumentException("Invalid cursor.");
        return service.NotificationsAsync(since, until ?? now, afterId, ct);
    }
    [HttpGet("orders")]
    public Task<Page<OrderRow>> Orders([FromQuery] OrderFilter filter, CancellationToken ct) => service.OrdersAsync(filter, ct);
    [HttpGet("orders/{id:int:min(1)}")]
    public async Task<IActionResult> Order(int id, CancellationToken ct) =>
        await service.OrderAsync(id, ct) is { } result ? Ok(result) : NotFound(new { error = "Pedido não encontrado." });
    [HttpPatch("orders/{id:int:min(1)}/status")]
    public async Task<IActionResult> Status(int id, StatusRequest request, CancellationToken ct)
    {
        if (!Enum.TryParse<OrderStatus>(request.ExpectedStatus, out var expected) || !Enum.IsDefined(expected) ||
            !Enum.TryParse<OrderStatus>(request.Status, out var next) || !Enum.IsDefined(next))
            return BadRequest(new { error = "Status inválido." });
        await service.AdvanceAsync(id, expected, next, ct);
        return NoContent();
    }
    [HttpGet("products")]
    public Task<IReadOnlyList<ProductRow>> Products(CancellationToken ct) => service.ProductsAsync(ct);
    [HttpPatch("products/{id:int:min(1)}")]
    public async Task<IActionResult> Product(int id, ProductRequest request, CancellationToken ct)
    {
        await service.UpdateProductAsync(id, request.Price!.Value, request.CostPrice, request.IsActive!.Value, ct);
        return NoContent();
    }
    [HttpGet("store")]
    public IActionResult Store() => Ok(new { deliveryFee = CreateOrderHandler.DeliveryFee });
    [HttpGet("finance/summary")]
    public Task<FinanceSummary> Summary([FromQuery] PeriodRequest filter, CancellationToken ct) => service.SummaryAsync(Range(filter), ct);
    [HttpGet("finance/revenue")]
    public Task<IReadOnlyList<RevenuePoint>> Revenue([FromQuery] PeriodRequest filter, CancellationToken ct) => service.RevenueAsync(Range(filter), ct);
    [HttpGet("finance/payment-methods")]
    public Task<IReadOnlyList<MethodSummary>> Methods([FromQuery] PeriodRequest filter, CancellationToken ct) => service.MethodsAsync(Range(filter), ct);
    [HttpGet("finance/transactions")]
    public Task<Page<TransactionRow>> Transactions([FromQuery] PeriodRequest filter, int page = 1, CancellationToken ct = default) =>
        service.TransactionsAsync(Range(filter), page, ct);
    private DateRange Range(PeriodRequest request)
    {
        var today = DateRange.LocalToday(clock.GetUtcNow().UtcDateTime);
        if (request.Period == "custom")
        {
            if (!DateTime.TryParseExact(request.Start, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) ||
                !DateTime.TryParseExact(request.End, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var end))
                throw new ArgumentException("Invalid date.");
            return DateRange.FromDates(start, end);
        }
        var first = request.Period switch
        {
            "today" => today, "7d" => today.AddDays(-6), "30d" => today.AddDays(-29),
            "month" => new DateTime(today.Year, today.Month, 1),
            _ => throw new ArgumentException("Invalid period.")
        };
        return DateRange.FromDates(first, today);
    }
}
public record PeriodRequest(string Period = "7d", string? Start = null, string? End = null);
public record StatusRequest([Required] string ExpectedStatus, [Required] string Status);
public record ProductRequest([Required] decimal? Price, decimal? CostPrice, [Required] bool? IsActive);
