using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.ProcessCardPayment;

public sealed class ProcessCardPaymentHandler
{
    private readonly IPaymentRepository _paymentRepository;
    private readonly IPaymentGateway _paymentGateway;

    public ProcessCardPaymentHandler(
        IPaymentRepository paymentRepository,
        IPaymentGateway paymentGateway)
    {
        _paymentRepository = paymentRepository;
        _paymentGateway = paymentGateway;
    }

    public async Task<ProcessCardPaymentResponse> HandleAsync(
        ProcessCardPaymentRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.PaymentId <= 0)
            throw new ArgumentException(
                "Payment id must be greater than zero."
            );

        if (string.IsNullOrWhiteSpace(request.PaymentToken))
            throw new ArgumentException(
                "Payment token cannot be empty."
            );

        if (string.IsNullOrWhiteSpace(request.PaymentMethodId))
            throw new ArgumentException(
                "Payment method id cannot be empty."
            );

        if (request.Installments <= 0)
            throw new ArgumentException(
                "Installments must be greater than zero."
            );

        if (string.IsNullOrWhiteSpace(request.PayerEmail))
            throw new ArgumentException(
                "Payer email cannot be empty."
            );

        var payment = await _paymentRepository.GetByIdAsync(
            request.PaymentId,
            cancellationToken
        );

        if (payment is null)
            throw new KeyNotFoundException(
                $"Payment '{request.PaymentId}' was not found."
            );

        if (payment.Status != PaymentStatus.Pending)
        {
            throw new InvalidOperationException(
                $"Payment in status '{payment.Status}' cannot be processed."
            );
        }

        var gatewayRequest = new PaymentGatewayRequest
        {
            OrderId = payment.OrderId,
            Amount = payment.Amount,
            IdempotencyKey = payment.IdempotencyKey,

            PaymentToken = request.PaymentToken.Trim(),
            PaymentMethodId = request.PaymentMethodId.Trim(),
            Installments = request.Installments,
            PayerEmail = request.PayerEmail.Trim()
        };

        PaymentGatewayResult gatewayResult;

        try
        {
            gatewayResult =
                await _paymentGateway.ProcessAsync(
                    gatewayRequest,
                    cancellationToken
                );
        }
        catch (HttpRequestException exception)
        {
            if (IsDefinitiveProviderRejection(exception))
            {
                payment.Reject();

                await _paymentRepository.SaveChangesAsync(
                    cancellationToken
                );
            }

            throw;
        }

        if (string.IsNullOrWhiteSpace(
                gatewayResult.ExternalOrderId))
        {
            throw new InvalidOperationException(
                "Payment gateway returned an invalid external order id."
            );
        }

        payment.SetExternalOrderId(
            gatewayResult.ExternalOrderId
        );

        if (!string.IsNullOrWhiteSpace(
                gatewayResult.ExternalPaymentId))
        {
            payment.SetExternalPaymentId(
                gatewayResult.ExternalPaymentId
            );
        }

        switch (gatewayResult.Status)
        {
            case PaymentGatewayStatus.Pending:
                break;

            case PaymentGatewayStatus.Approved:
                payment.Approve();
                break;

            case PaymentGatewayStatus.Rejected:
                payment.Reject();
                break;

            case PaymentGatewayStatus.Cancelled:
                payment.Cancel();
                break;

            case PaymentGatewayStatus.Expired:
            case PaymentGatewayStatus.Refunded:
            case PaymentGatewayStatus.PartiallyRefunded:
            case PaymentGatewayStatus.ChargedBack:
                throw new InvalidOperationException(
                    $"Gateway status '{gatewayResult.Status}' " +
                    "is not valid during initial card processing."
                );

            default:
                throw new InvalidOperationException(
                    "Payment gateway returned an unsupported status."
                );
        }

        await _paymentRepository.SaveChangesAsync(
            cancellationToken
        );

        return new ProcessCardPaymentResponse
        {
            PaymentId = payment.Id,
            OrderId = payment.OrderId,
            Amount = payment.Amount,
            Status = payment.Status,
            ExternalOrderId = payment.ExternalOrderId,
            ExternalPaymentId = payment.ExternalPaymentId
        };
    }

    private static bool IsDefinitiveProviderRejection(
        HttpRequestException exception)
    {
        if (exception.StatusCode is null)
        {
            return false;
        }

        var statusCode = (int)exception.StatusCode.Value;

        return statusCode >= 400 &&
               statusCode < 500;
    }
}