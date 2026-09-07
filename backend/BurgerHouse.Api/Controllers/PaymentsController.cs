using BurgerHouse.Application.Payments.CreatePayment;
using BurgerHouse.Application.Payments.ProcessCardPayment;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/payments")]
public class PaymentsController : ControllerBase
{
    private readonly CreatePaymentHandler _createPaymentHandler;
    private readonly ProcessCardPaymentHandler _processCardPaymentHandler;

    public PaymentsController(
        CreatePaymentHandler createPaymentHandler,
        ProcessCardPaymentHandler processCardPaymentHandler)
    {
        _createPaymentHandler = createPaymentHandler;
        _processCardPaymentHandler = processCardPaymentHandler;
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

    [HttpPost("{paymentId:int}/card")]
    public async Task<ActionResult<ProcessCardPaymentResponse>> ProcessCardAsync(
        [FromRoute] int paymentId,
        [FromBody] ProcessCardPaymentRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var command = new ProcessCardPaymentRequest
            {
                PaymentId = paymentId,
                PaymentToken = request.PaymentToken,
                PaymentMethodId = request.PaymentMethodId,
                Installments = request.Installments,
                PayerEmail = request.PayerEmail
            };

            var response =
                await _processCardPaymentHandler.HandleAsync(
                    command,
                    cancellationToken
                );

            return Ok(response);
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
        catch (HttpRequestException)
        {
            return StatusCode(
                StatusCodes.Status502BadGateway,
                new
                {
                    error =
                        "The payment provider could not process the request."
                }
            );
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