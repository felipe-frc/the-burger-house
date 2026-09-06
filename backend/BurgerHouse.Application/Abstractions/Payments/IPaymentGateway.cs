namespace BurgerHouse.Application.Abstractions.Payments;

public interface IPaymentGateway
{
    Task<PaymentGatewayResult> ProcessAsync(
        PaymentGatewayRequest request,
        CancellationToken cancellationToken = default
    );
}