using BurgerHouse.Infrastructure.Orders;
using BurgerHouse.Application.Orders.CreateOrder;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/orders")]
[Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("StorefrontWrite")]
[RequestSizeLimit(64 * 1024)]
public class OrdersController : ControllerBase
{
    private readonly CreateOrderHandler _createOrderHandler;
    private readonly OrderPricingService? _pricing;

    public OrdersController(CreateOrderHandler createOrderHandler, OrderPricingService? pricing = null)
    {
        _createOrderHandler = createOrderHandler;
        _pricing = pricing;
    }

    [HttpPost("quote")]
    public async Task<IActionResult> Quote(CreateOrderRequest request, CancellationToken ct)
    {
        if (_pricing is null) return BadRequest(new { error = "A cotação está indisponível." });
        try { return Ok(await _pricing.QuoteAsync(request, ct)); }
        catch (ArgumentException error) { return BadRequest(new { error = error.Message }); }
    }

    [HttpPost]
    public async Task<ActionResult<CreateOrderResponse>> CreateAsync(
        [FromBody] CreateOrderRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            if (request.Items == null || request.Items.Any(x => x == null || x.Extras == null))
                throw new ArgumentException("Confira os itens da sacola.");
            var customized = !string.IsNullOrWhiteSpace(request.CouponCode) || request.Items.Any(x => x.Extras.Count > 0);
            if (customized && _pricing == null) throw new ArgumentException("A personalização está indisponível.");
            var response = customized
                ? await _pricing!.CreateAsync(request, cancellationToken)
                : await _createOrderHandler.HandleAsync(request, cancellationToken);

            return StatusCode(
                StatusCodes.Status201Created,
                response
            );
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(new
            {
                error = exception.Message
            });
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new
            {
                error = exception.Message
            });
        }
    }
}
