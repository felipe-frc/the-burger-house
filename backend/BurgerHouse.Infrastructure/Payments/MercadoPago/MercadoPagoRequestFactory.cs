using System.Globalization;

using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

internal static class MercadoPagoRequestFactory
{
    public static MercadoPagoCreateOrderRequest Create(
        PaymentGatewayRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.OrderId <= 0)
        {
            throw new ArgumentException(
                "Order id must be greater than zero."
            );
        }

        if (request.Amount <= 0)
        {
            throw new ArgumentException(
                "Payment amount must be greater than zero."
            );
        }

        if (string.IsNullOrWhiteSpace(
                request.PayerEmail))
        {
            throw new ArgumentException(
                "Payer email cannot be empty."
            );
        }

        var paymentMethod =
            CreatePaymentMethod(request);

        var identification =
            CreateIdentification(request);

        var formattedAmount =
            request.Amount.ToString(
                "0.00",
                CultureInfo.InvariantCulture
            );

        return new MercadoPagoCreateOrderRequest
        {
            TotalAmount =
                formattedAmount,

            ExternalReference =
                request.OrderId.ToString(
                    CultureInfo.InvariantCulture
                ),

            Payer =
                new MercadoPagoPayerRequest
                {
                    Email =
                        request.PayerEmail.Trim(),

                    FirstName =
                        CreateSandboxPayerFirstName(
                            request
                        ),

                    Identification =
                        identification
                },

            Transactions =
                new MercadoPagoTransactionsRequest
                {
                    Payments =
                    [
                        new MercadoPagoPaymentRequest
                        {
                            Amount =
                                formattedAmount,

                            PaymentMethod =
                                paymentMethod
                        }
                    ]
                }
        };
    }

    private static string?
        CreateSandboxPayerFirstName(
            PaymentGatewayRequest request)
    {
        if (request.Method != PaymentMethod.Pix)
        {
            return null;
        }

        var email =
            request.PayerEmail.Trim();

        return email.EndsWith(
            "@testuser.com",
            StringComparison.OrdinalIgnoreCase
        )
            ? "APRO"
            : null;
    }

    private static MercadoPagoIdentificationRequest?
        CreateIdentification(
            PaymentGatewayRequest request)
    {
        var type =
            request.PayerIdentificationType?
                .Trim();

        var number =
            request.PayerIdentificationNumber?
                .Trim();

        if (string.IsNullOrWhiteSpace(type) &&
            string.IsNullOrWhiteSpace(number))
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(type))
        {
            throw new ArgumentException(
                "Payer identification type cannot be empty."
            );
        }

        if (string.IsNullOrWhiteSpace(number))
        {
            throw new ArgumentException(
                "Payer identification number cannot be empty."
            );
        }

        return new MercadoPagoIdentificationRequest
        {
            Type =
                type,

            Number =
                number
        };
    }

    private static MercadoPagoPaymentMethodRequest
        CreatePaymentMethod(
            PaymentGatewayRequest request)
    {
        return request.Method switch
        {
            PaymentMethod.Pix =>
                new MercadoPagoPaymentMethodRequest
                {
                    Id = "pix",
                    Type = "bank_transfer"
                },

            PaymentMethod.CreditCard =>
                CreateCardPaymentMethod(
                    request,
                    "credit_card",
                    NormalizeCreditPaymentMethodId(
                        request.PaymentMethodId
                    )
                ),

            PaymentMethod.DebitCard =>
                CreateDebitPaymentMethod(
                    request
                ),

            _ => throw new ArgumentException(
                "Payment method is invalid."
            )
        };
    }

    private static MercadoPagoPaymentMethodRequest
        CreateDebitPaymentMethod(
            PaymentGatewayRequest request)
    {
        if (request.Installments != 1)
        {
            throw new ArgumentException(
                "Debit card payments must use exactly one installment."
            );
        }

        return CreateCardPaymentMethod(
            request,
            "debit_card",
            NormalizeDebitPaymentMethodId(
                request.PaymentMethodId
            )
        );
    }

    private static MercadoPagoPaymentMethodRequest
        CreateCardPaymentMethod(
            PaymentGatewayRequest request,
            string expectedType,
            string paymentMethodId)
    {
        if (string.IsNullOrWhiteSpace(
                request.PaymentToken))
        {
            throw new ArgumentException(
                "Payment token cannot be empty."
            );
        }

        if (string.IsNullOrWhiteSpace(
                paymentMethodId))
        {
            throw new ArgumentException(
                "Payment method id cannot be empty."
            );
        }

        if (request.Installments <= 0)
        {
            throw new ArgumentException(
                "Installments must be greater than zero."
            );
        }

        var paymentTypeId =
            string.IsNullOrWhiteSpace(
                request.PaymentTypeId)
                ? expectedType
                : request.PaymentTypeId
                    .Trim()
                    .ToLowerInvariant();

        if (!string.Equals(
                paymentTypeId,
                expectedType,
                StringComparison.Ordinal))
        {
            throw new ArgumentException(
                $"Payment type '{paymentTypeId}' does not match '{expectedType}'."
            );
        }

        return new MercadoPagoPaymentMethodRequest
        {
            Id =
                paymentMethodId,

            Type =
                paymentTypeId,

            Token =
                request.PaymentToken.Trim(),

            Installments =
                request.Installments
        };
    }

    private static string
        NormalizeCreditPaymentMethodId(
            string? paymentMethodId)
    {
        if (string.IsNullOrWhiteSpace(
                paymentMethodId))
        {
            return string.Empty;
        }

        return paymentMethodId
            .Trim()
            .ToLowerInvariant();
    }

    private static string
        NormalizeDebitPaymentMethodId(
            string? paymentMethodId)
    {
        if (string.IsNullOrWhiteSpace(
                paymentMethodId))
        {
            return string.Empty;
        }

        var normalizedId =
            paymentMethodId
                .Trim()
                .ToLowerInvariant();

        return normalizedId switch
        {
            "elo" => "debelo",
            "master" => "debmaster",
            "mastercard" => "debmaster",
            "visa" => "debvisa",

            "debelo" => "debelo",
            "debmaster" => "debmaster",
            "debvisa" => "debvisa",

            _ => normalizedId
        };
    }
}