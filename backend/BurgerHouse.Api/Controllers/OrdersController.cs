using BurgerHouse.Application.Orders.CreateOrder;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    private readonly CreateOrderHandler _createOrderHandler;

    public OrdersController(CreateOrderHandler createOrderHandler)
    {
        _createOrderHandler = createOrderHandler;
    }

    [HttpPost]
    public async Task<ActionResult<CreateOrderResponse>> CreateAsync(
        [FromBody] CreateOrderRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await _createOrderHandler.HandleAsync(
                request,
                cancellationToken
            );

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