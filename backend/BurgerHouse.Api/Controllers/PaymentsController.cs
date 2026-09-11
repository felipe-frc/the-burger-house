using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.CreatePayment;
using BurgerHouse.Application.Payments.GetPaymentStatus;
using BurgerHouse.Application.Payments.ProcessCardPayment;
using BurgerHouse.Application.Payments.ProcessPixPayment;
using BurgerHouse.Application.Payments.SynchronizePaymentStatus;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.MercadoPago;

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

    private readonly IPaymentRepository?
        _paymentRepository;

    private readonly MercadoPagoOrderLookup?
        _mercadoPagoOrderLookup;

    private readonly SynchronizePaymentStatusHandler?
        _synchronizePaymentStatusHandler;

    public PaymentsController(
        CreatePaymentHandler createPaymentHandler,
        ProcessCardPaymentHandler processCardPaymentHandler,
        ProcessPixPaymentHandler? processPixPaymentHandler = null,
        GetPaymentStatusHandler? getPaymentStatusHandler = null,
        IPaymentRepository? paymentRepository = null,
        MercadoPagoOrderLookup? mercadoPagoOrderLookup = null,
        SynchronizePaymentStatusHandler? synchronizePaymentStatusHandler = null)
    {
        _createPaymentHandler =
            createPaymentHandler;

        _processCardPaymentHandler =
            processCardPaymentHandler;

        _processPixPaymentHandler =
            processPixPaymentHandler;

        _getPaymentStatusHandler =
            getPaymentStatusHandler;

        _paymentRepository =
            paymentRepository;

        _mercadoPagoOrderLookup =
            mercadoPagoOrderLookup;

        _synchronizePaymentStatusHandler =
            synchronizePaymentStatusHandler;
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
            await RefreshPendingPaymentStatusAsync(
                paymentId,
                cancellationToken
            );

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
    public async Task<
        ActionResult<CreatePaymentResponse>>
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
                    PaymentId =
                        paymentId,

                    PaymentToken =
                        request.PaymentToken,

                    PaymentMethodId =
                        request.PaymentMethodId,

                    PaymentTypeId =
                        request.PaymentTypeId,

                    Installments =
                        request.Installments,

                    PayerEmail =
                        request.PayerEmail,

                    PayerIdentificationType =
                        request.PayerIdentificationType,

                    PayerIdentificationNumber =
                        request.PayerIdentificationNumber
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
                error =
                    exception.Message
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
                error =
                    exception.Message
            });
        }
    }

    private async Task
        RefreshPendingPaymentStatusAsync(
            int paymentId,
            CancellationToken cancellationToken)
    {
        if (
            _paymentRepository is null ||
            _mercadoPagoOrderLookup is null ||
            _synchronizePaymentStatusHandler is null
        )
        {
            return;
        }

        var payment =
            await _paymentRepository
                .GetByIdAsync(
                    paymentId,
                    cancellationToken
                );

        if (
            payment is null ||
            payment.Status !=
                PaymentStatus.Pending ||
            string.IsNullOrWhiteSpace(
                payment.ExternalOrderId
            )
        )
        {
            return;
        }

        MercadoPagoOrderSnapshot?
            snapshot;

        try
        {
            snapshot =
                await _mercadoPagoOrderLookup
                    .GetAsync(
                        payment.ExternalOrderId,
                        cancellationToken
                    );
        }
        catch (HttpRequestException)
        {
            return;
        }

        if (snapshot is null)
        {
            return;
        }

        if (
            snapshot.PaymentStatus is not (
                PaymentGatewayStatus.Approved or
                PaymentGatewayStatus.Rejected or
                PaymentGatewayStatus.Cancelled or
                PaymentGatewayStatus.Expired
            )
        )
        {
            return;
        }

        await _synchronizePaymentStatusHandler
            .HandleAsync(
                snapshot.Id,
                snapshot.PaymentStatus,
                cancellationToken,
                snapshot.ExternalPaymentId
            );
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
