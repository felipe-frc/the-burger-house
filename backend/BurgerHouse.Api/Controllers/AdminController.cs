using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Security.Claims;
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
    [HttpGet("customers")]
    public Task<IReadOnlyList<CustomerSummary>> Customers([StringLength(120)] string? search, CancellationToken ct) =>
        service.CustomersAsync(clock.GetUtcNow().UtcDateTime.AddDays(-365), search, ct);
    [HttpGet("notifications")]
    public Task<NotificationBatch> Notifications(DateTime? since = null, DateTime? until = null, int afterId = 0, CancellationToken ct = default)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        if (until > now) throw new ArgumentException("Invalid cursor.");
        return service.NotificationsAsync(since, until ?? now, afterId, ct);
    }
    [HttpGet("orders")]
    public Task<Page<OrderRow>> Orders([FromQuery] OrderFilter filter, CancellationToken ct) => service.OrdersAsync(filter, ct);
    [HttpGet("orders/movement")]
    public Task<OrderMovementReport> OrderMovement(string? month, string? channel, CancellationToken ct)
    {
        if (channel is not (null or "delivery" or "pickup")) throw new ArgumentException("Invalid channel.");
        var now = clock.GetUtcNow().UtcDateTime;
        var today = DateOnly.FromDateTime(DateRange.LocalToday(now));
        if (month is null)
            return service.OrderMovementAsync(today.AddDays(-27), today, now, channel, ct);
        var first = new DateOnly(today.Year, today.Month, 1);
        if (month != "current" && (!DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out first) ||
            first.Year < 2 || first > today))
            throw new ArgumentException("Invalid month.");
        var end = new DateOnly(first.Year, first.Month, DateTime.DaysInMonth(first.Year, first.Month));
        return service.OrderMovementAsync(first, end, now, channel, ct);
    }
    [HttpGet("orders/operational")]
    public Task<Page<OperationalOrder>> OperationalOrders([FromQuery] OrderFilter filter, CancellationToken ct) =>
        service.OperationalOrdersAsync(filter, ct);
    [HttpGet("orders/{id:int:min(1)}")]
    public async Task<IActionResult> Order(int id, CancellationToken ct) =>
        await service.OrderAsync(id, ct) is { } result ? Ok(result) : NotFound(new { error = "Pedido não encontrado." });
    [HttpPatch("orders/{id:int:min(1)}/status")]
    public async Task<IActionResult> Status(int id, StatusRequest request, CancellationToken ct)
    {
        if (!Enum.TryParse<OrderStatus>(request.ExpectedStatus, out var expected) ||
            !Enum.IsDefined(expected) ||
            !Enum.TryParse<OrderStatus>(request.Status, out var next) ||
            !Enum.IsDefined(next))
            return BadRequest(new { error = "Status inválido." });

        var adminUserId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!
        );

        await service.AdvanceAsync(
            id,
            expected,
            next,
            adminUserId,
            clock.GetUtcNow().UtcDateTime,
            ct,
            request.Checklist
        );

        return NoContent();
    }
    [HttpGet("products")]
    public Task<IReadOnlyList<ProductRow>> Products(CancellationToken ct) => service.ProductsAsync(ct);
    [HttpGet("operation/settings")]
    public Task<OperationSettings> OperationSettings(CancellationToken ct) => service.OperationSettingsAsync(ct);
    [HttpPut("operation/settings")]
    public async Task<IActionResult> SaveOperationSettings(OperationSettings request, CancellationToken ct)
    {
        var ownerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await service.SaveOperationSettingsAsync(request, ownerId, clock.GetUtcNow().UtcDateTime, ct);
        return NoContent();
    }
    [HttpPost("products/translate")]
    public async Task<IActionResult> TranslateProduct(
        ProductTranslationRequest request,
        [FromServices] BurgerHouse.Application.Translations.IProductTranslationService translator,
        CancellationToken ct)
    {
        var name = request.Name.Trim();
        var description = request.Description.Trim();

        if (name.Length == 0 || description.Length == 0)
            return BadRequest(new
            {
                error = "Informe nome e descricao em portugues."
            });

        try
        {
            var translation = await translator.TranslateAsync(
                name,
                description,
                ct
            );

            return Ok(new
            {
                englishName = translation.EnglishName,
                englishDescription = translation.EnglishDescription
            });
        }
        catch (HttpRequestException)
        {
            return StatusCode(503, new
            {
                error = "O tradutor esta temporariamente indisponivel."
            });
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return StatusCode(503, new
            {
                error = "Tempo limite excedido. Tente novamente."
            });
        }
        catch (InvalidOperationException)
        {
            return StatusCode(503, new
            {
                error = "Nao foi possivel concluir a traducao."
            });
        }
    }
    [HttpPost("products")]
    public async Task<IActionResult> CreateProduct(
        ProductRequest request,
        CancellationToken ct)
    {
        var adminUserId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!
        );

        var id = await service.CreateProductAsync(
            request.Name,
            request.Description,
            request.Price!.Value,
            request.CostPrice,
            request.IsActive!.Value,
            adminUserId,
            clock.GetUtcNow().UtcDateTime,
            ct,
            request.EnglishName,
            request.EnglishDescription,
            request.Category ?? "menu",
            request.DisplayOrder ?? 1000
        );

        return StatusCode(201, new { id });
    }
    [HttpPatch("products/{id:int:min(1)}")]
    public async Task<IActionResult> Product(int id, ProductRequest request, CancellationToken ct)
    {
        var adminUserId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!
        );

        await service.UpdateProductAsync(
            id,
            request.Name,
            request.Description,
            request.Price!.Value,
            request.CostPrice,
            request.IsActive!.Value,
            adminUserId,
            clock.GetUtcNow().UtcDateTime,
            ct,
            request.EnglishName,
            request.EnglishDescription,
            request.Category,
            request.DisplayOrder
        );

        return NoContent();
    }
    [HttpGet("store")]
    public IActionResult Store() => Ok(new { deliveryFee = CreateOrderHandler.DeliveryFee });
    [HttpGet("finance/summary")]
    public async Task<FinanceSummary> Summary([FromQuery] PeriodRequest filter, CancellationToken ct) =>
        await service.SummaryAsync(await RangeAsync(filter, ct), ct);
    [HttpGet("finance/revenue")]
    public async Task<IReadOnlyList<RevenuePoint>> Revenue([FromQuery] PeriodRequest filter, string? granularity, CancellationToken ct)
    {
        var range = await RangeAsync(filter, ct);
        return granularity == "hour" ? await service.HourlyRevenueAsync(range, ct) : await service.RevenueAsync(range, ct);
    }
    [HttpGet("finance/payment-methods")]
    public async Task<IReadOnlyList<MethodSummary>> Methods([FromQuery] PeriodRequest filter, CancellationToken ct) =>
        await service.MethodsAsync(await RangeAsync(filter, ct), ct);
    [HttpGet("finance/revenue-by-category")]
    public async Task<CategoryRevenueReport> CategoryRevenue([FromQuery] PeriodRequest filter, CancellationToken ct) =>
        await service.CategoryRevenueAsync(await RangeAsync(filter, ct), ct);
    [HttpGet("finance/transactions")]
    public async Task<Page<TransactionRow>> Transactions([FromQuery] PeriodRequest filter, int page = 1, CancellationToken ct = default) =>
        await service.TransactionsAsync(await RangeAsync(filter, ct), page, ct);

    [HttpGet("finance/audit")]
    public async Task<IReadOnlyList<AuditLogRow>> Audit(
        [FromQuery] PeriodRequest filter,
        CancellationToken ct) =>
        await service.AuditLogsAsync(
            await RangeAsync(filter, ct),
            ct
        );
    private async Task<DateRange> RangeAsync(PeriodRequest request, CancellationToken ct)
    {
        if (request.Channel is not (null or "delivery" or "pickup")) throw new ArgumentException("Invalid channel.");
        var utcNow = clock.GetUtcNow().UtcDateTime;
        if (request.Period == "shift")
        {
            var settings = await service.OperationSettingsAsync(ct);
            var shift = DateRange.ForShift(utcNow, settings.Limits.Schedule) ?? throw new ArgumentException("No store shift configured.");
            return shift with { Channel = request.Channel };
        }
        var today = DateRange.LocalToday(utcNow);
        if (request.Period == "custom")
        {
            if (!DateTime.TryParseExact(request.Start, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) ||
                !DateTime.TryParseExact(request.End, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var end))
                throw new ArgumentException("Invalid date.");
            return DateRange.FromDates(start, end) with { Channel = request.Channel };
        }
        var first = request.Period switch
        {
            "today" => today, "7d" => today.AddDays(-6), "30d" => today.AddDays(-29),
            "month" => new DateTime(today.Year, today.Month, 1),
            _ => throw new ArgumentException("Invalid period.")
        };
        return DateRange.FromDates(first, today) with { Channel = request.Channel };
    }
}
public record ProductTranslationRequest(
    [Required, StringLength(150, MinimumLength = 1)] string Name,
    [Required, StringLength(500, MinimumLength = 1)] string Description
);
public record PeriodRequest(string Period = "7d", string? Start = null, string? End = null, string? Channel = null);
public record StatusRequest([Required] string ExpectedStatus, [Required] string Status, DispatchChecklist? Checklist = null);
public record ProductRequest(
    [Required, StringLength(150, MinimumLength = 1)] string Name,
    [Required, StringLength(500, MinimumLength = 1)] string Description,
    [Required] decimal? Price,
    decimal? CostPrice,
    [Required] bool? IsActive,
    [StringLength(150)] string? EnglishName = null,
    [StringLength(500)] string? EnglishDescription = null,
    string? Category = null,
    int? DisplayOrder = null
);
