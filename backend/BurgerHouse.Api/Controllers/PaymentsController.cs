using BurgerHouse.Application.Payments.CreatePayment;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/payments")]
public class PaymentsController : ControllerBase
{
    private readonly CreatePaymentHandler _createPaymentHandler;

    public PaymentsController(CreatePaymentHandler createPaymentHandler)
    {
        _createPaymentHandler = createPaymentHandler;
    }

    [HttpPost]
    public async Task<ActionResult<CreatePaymentResponse>> CreateAsync(
        [FromBody] CreatePaymentRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await _createPaymentHandler.HandleAsync(
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
        catch (InvalidOperationException exception)
        {
            return Conflict(new
            {
                error = exception.Message
            });
        }
    }
}