using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.CreateHostedCheckout;

public sealed class CreateHostedCheckoutHandler(
    PrepareCheckoutPaymentHandler prepareCheckoutPaymentHandler,
    IPaymentRepository paymentRepository,
    IHostedCheckoutGateway hostedCheckoutGateway,
    IUnitOfWork unitOfWork)
{
    public async Task<CreateHostedCheckoutResult> HandleAsync(
        int orderId,
        CancellationToken cancellationToken = default)
    {
        if (orderId <= 0)
        {
            throw new ArgumentException(
                "Order id must be greater than zero.",
                nameof(orderId)
            );
        }

        int paymentId;
        HostedCheckoutCustomer? customer;

        // The local payment identity must be committed before it is sent
        // to the external provider. This preserves a retryable local attempt
        // even when checkout creation fails remotely.
        await using (
            var preparation =
                await unitOfWork.BeginTransactionAsync(
                    cancellationToken
                )
        )
        {
            var prepared =
                await prepareCheckoutPaymentHandler.HandleAsync(
                    orderId,
                    cancellationToken
                );

            paymentId =
                prepared.Payment.Id;

            customer =
                prepared.Customer;

            await preparation.CommitAsync(
                cancellationToken
            );
        }

        unitOfWork.ClearTracking();

        // The second transaction serializes competing checkout attempts
        // and protects the final provider checkout association.
        await using var transaction =
            await unitOfWork.BeginTransactionAsync(
                cancellationToken
            );

        var payment =
            await paymentRepository.GetByIdAsync(
                paymentId,
                cancellationToken
            )
            ?? throw new KeyNotFoundException(
                "Local payment was not found."
            );

        if (payment.Status != PaymentStatus.Pending)
        {
            throw new InvalidOperationException(
                "Payment is no longer pending."
            );
        }

        var checkout =
            await hostedCheckoutGateway.GetOrCreateAsync(
                payment,
                customer,
                cancellationToken
            );

        await unitOfWork.SaveChangesAsync(
            cancellationToken
        );

        await transaction.CommitAsync(
            cancellationToken
        );

        return new CreateHostedCheckoutResult(
            payment.Id,
            checkout.CheckoutUrl
        );
    }
}

public sealed record CreateHostedCheckoutResult(
    int PaymentId,
    string CheckoutUrl
);