using BurgerHouse.Application.Payments.CreatePayment;
using BurgerHouse.Application.Payments.GetPaymentStatus;
using BurgerHouse.Application.Payments.ProcessCardPayment;
using BurgerHouse.Application.Payments.ProcessPixPayment;

using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/payments")]
public class PaymentsController : ControllerBase
{
    private readonly CreatePaymentHandler
        _createPaymentHandler;

    private readonly ProcessCardPaymentHandler
        _processCardPaymentHandler;

    private readonly ProcessPixPaymentHandler?
        _processPixPaymentHandler;

    private readonly GetPaymentStatusHandler?
        _getPaymentStatusHandler;

    public PaymentsController(
        CreatePaymentHandler createPaymentHandler,
        ProcessCardPaymentHandler processCardPaymentHandler,
        ProcessPixPaymentHandler? processPixPaymentHandler = null,
        GetPaymentStatusHandler? getPaymentStatusHandler = null)
    {
        _createPaymentHandler =
            createPaymentHandler;

        _processCardPaymentHandler =
            processCardPaymentHandler;

        _processPixPaymentHandler =
            processPixPaymentHandler;

        _getPaymentStatusHandler =
            getPaymentStatusHandler;
    }

    [HttpGet("{paymentId:int}")]
    public async Task<
        ActionResult<GetPaymentStatusResponse>>
        GetStatusAsync(
            [FromRoute] int paymentId,
            CancellationToken cancellationToken)
    {
        if (_getPaymentStatusHandler is null)
        {
            return StatusCode(
                StatusCodes
                    .Status500InternalServerError,
                new
                {
                    error =
                        "Payment status handler is unavailable."
                }
            );
        }

        try
        {
            var response =
                await _getPaymentStatusHandler
                    .HandleAsync(
                        paymentId,
                        cancellationToken
                    );

            return Ok(
                response
            );
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(new
            {
                error =
                    exception.Message
            });
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new
            {
                error =
                    exception.Message
            });
        }
    }

    [HttpPost]
    public async Task<ActionResult<CreatePaymentResponse>>
        CreateAsync(
            [FromBody] CreatePaymentRequest request,
            CancellationToken cancellationToken)
    {
        try
        {
            var response =
                await _createPaymentHandler
                    .HandleAsync(
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
    public async Task<
        ActionResult<ProcessCardPaymentResponse>>
        ProcessCardAsync(
            [FromRoute] int paymentId,
            [FromBody] ProcessCardPaymentRequest request,
            CancellationToken cancellationToken)
    {
        try
        {
            var command =
                new ProcessCardPaymentRequest
                {
                    PaymentId = paymentId,

                    PaymentToken =
                        request.PaymentToken,

                    PaymentMethodId =
                        request.PaymentMethodId,

                    Installments =
                        request.Installments,

                    PayerEmail =
                        request.PayerEmail
                };

            var response =
                await _processCardPaymentHandler
                    .HandleAsync(
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
        catch (HttpRequestException exception)
            when (
                IsDefinitiveProviderRejection(
                    exception
                ))
        {
            return UnprocessableEntity(new
            {
                error =
                    "The payment provider rejected the request.",

                code =
                    "payment_provider_rejected"
            });
        }
        catch (HttpRequestException)
        {
            return StatusCode(
                StatusCodes.Status502BadGateway,
                new
                {
                    error =
                        "The payment provider could not process the request.",

                    code =
                        "payment_provider_unavailable"
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

    [HttpPost("{paymentId:int}/pix")]
    public async Task<
        ActionResult<ProcessPixPaymentResponse>>
        ProcessPixAsync(
            [FromRoute] int paymentId,
            [FromBody] ProcessPixPaymentRequest request,
            CancellationToken cancellationToken)
    {
        if (_processPixPaymentHandler is null)
        {
            return StatusCode(
                StatusCodes
                    .Status500InternalServerError,
                new
                {
                    error =
                        "Pix payment handler is unavailable."
                }
            );
        }

        try
        {
            var command =
                new ProcessPixPaymentRequest
                {
                    PaymentId =
                        paymentId,

                    PayerEmail =
                        request.PayerEmail
                };

            var response =
                await _processPixPaymentHandler
                    .HandleAsync(
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
        catch (HttpRequestException exception)
            when (
                IsDefinitiveProviderRejection(
                    exception
                ))
        {
            return UnprocessableEntity(new
            {
                error =
                    "The payment provider rejected the request.",

                code =
                    "payment_provider_rejected"
            });
        }
        catch (HttpRequestException)
        {
            return StatusCode(
                StatusCodes.Status502BadGateway,
                new
                {
                    error =
                        "The payment provider could not process the request.",

                    code =
                        "payment_provider_unavailable"
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

    private static bool
        IsDefinitiveProviderRejection(
            HttpRequestException exception)
    {
        if (exception.StatusCode is null)
        {
            return false;
        }

        var statusCode =
            (int)exception.StatusCode.Value;

        return statusCode >= 400 &&
               statusCode < 500;
    }
}