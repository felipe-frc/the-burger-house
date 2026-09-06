using BurgerHouse.Application.Abstractions.Payments;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public class MercadoPagoPaymentGateway : IPaymentGateway
{
    private readonly HttpClient _httpClient;

    public MercadoPagoPaymentGateway(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public Task<PaymentGatewayResult> ProcessAsync(
        PaymentGatewayRequest request,
        CancellationToken cancellationToken = default)
    {
        throw new NotImplementedException();
    }
}