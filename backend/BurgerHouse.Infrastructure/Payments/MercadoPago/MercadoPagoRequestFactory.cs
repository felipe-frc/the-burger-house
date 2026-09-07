using System.Globalization;
using BurgerHouse.Application.Abstractions.Payments;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

internal static class MercadoPagoRequestFactory
{
    public static MercadoPagoCreateOrderRequest Create(
        PaymentGatewayRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.OrderId <= 0)
            throw new ArgumentException(
                "Order id must be greater than zero."
            );

        if (request.Amount <= 0)
            throw new ArgumentException(
                "Payment amount must be greater than zero."
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

        var formattedAmount = request.Amount.ToString(
            "0.00",
            CultureInfo.InvariantCulture
        );

        return new MercadoPagoCreateOrderRequest
        {
            TotalAmount = formattedAmount,
            ExternalReference = request.OrderId.ToString(
                CultureInfo.InvariantCulture
            ),
            Payer = new MercadoPagoPayerRequest
            {
                Email = request.PayerEmail.Trim()
            },
            Transactions = new MercadoPagoTransactionsRequest
            {
                Payments =
                [
                    new MercadoPagoPaymentRequest
                    {
                        Amount = formattedAmount,
                        PaymentMethod =
                            new MercadoPagoPaymentMethodRequest
                            {
                                Id = request.PaymentMethodId.Trim(),
                                Token = request.PaymentToken.Trim(),
                                Installments = request.Installments
                            }
                    }
                ]
            }
        };
    }
}