using System.Globalization;
using BurgerHouse.Domain.Entities;
using MercadoPago.Client;
using MercadoPago.Client.Preference;
using MercadoPago.Http;
using MercadoPago.Resource.Preference;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoPreferenceService
{
    private readonly PreferenceClient _client;
    private readonly MercadoPagoOptions _options;

    public MercadoPagoPreferenceService(
        HttpClient httpClient,
        IOptions<MercadoPagoOptions> options)
    {
        _options = options.Value;

        if (string.IsNullOrWhiteSpace(_options.AccessToken))
        {
            throw new InvalidOperationException(
                "Mercado Pago access token was not configured."
            );
        }

        ValidatePublicUrl(_options.ReturnUrl);

        _client = new PreferenceClient(
            new DefaultHttpClient(httpClient)
        );
    }

    public async Task<Preference> GetOrCreateAsync(
        Payment payment,
        CancellationToken cancellationToken = default)
    {
        if (payment.Id <= 0)
        {
            throw new InvalidOperationException(
                "Payment must be persisted before creating checkout."
            );
        }

        var reference =
            payment.Id.ToString(CultureInfo.InvariantCulture);

        var requestOptions = new RequestOptions
        {
            AccessToken = _options.AccessToken
        };

        Preference preference;

        if (payment.ExternalPreferenceId is not null)
        {
            preference = await _client.GetAsync(
                payment.ExternalPreferenceId,
                requestOptions,
                cancellationToken
            );

            if (preference.Id != payment.ExternalPreferenceId ||
                preference.ExternalReference != reference)
            {
                throw new InvalidOperationException(
                    "Checkout preference does not match this payment."
                );
            }
        }
        else
        {
            var request = new PreferenceRequest
            {
                Items =
                [
                    new PreferenceItemRequest
                    {
                        Id = $"order-{payment.OrderId}",
                        Title = $"Pedido The Burger House #{payment.OrderId}",
                        Quantity = 1,
                        CurrencyId = "BRL",
                        UnitPrice = payment.Amount
                    }
                ],

                ExternalReference = reference,

                StatementDescriptor = "BURGER HOUSE",

                // Pix is asynchronous in Checkout Pro and can remain pending
                // until the transfer is completed.
                BinaryMode = false,

                PaymentMethods = new PreferencePaymentMethodsRequest
                {
                    Installments = 12,
                    DefaultInstallments = 1,

                    ExcludedPaymentTypes =
                    [
                        new PreferencePaymentTypeRequest
                        {
                            Id = "ticket"
                        },

                        new PreferencePaymentTypeRequest
                        {
                            Id = "atm"
                        },

                        new PreferencePaymentTypeRequest
                        {
                            Id = "digital_currency"
                        }
                    ]
                }
            };

            if (!string.IsNullOrWhiteSpace(_options.ReturnUrl))
            {
                request.BackUrls = new PreferenceBackUrlsRequest
                {
                    Success = _options.ReturnUrl,
                    Pending = _options.ReturnUrl,
                    Failure = _options.ReturnUrl
                };

                request.AutoReturn = "approved";
            }

            preference = await _client.CreateAsync(
                request,
                requestOptions,
                cancellationToken
            );
        }

        if (string.IsNullOrWhiteSpace(preference.Id) ||
            preference.ExternalReference != reference ||
            !IsCheckoutUrl(preference.InitPoint))
        {
            throw new InvalidOperationException(
                "Mercado Pago returned an invalid checkout preference."
            );
        }

        if (preference.Expires == true &&
            preference.ExpirationDateTo is not null &&
            preference.ExpirationDateTo <= DateTime.UtcNow)
        {
            throw new InvalidOperationException(
                "This checkout preference has expired."
            );
        }

        payment.SetExternalPreferenceId(
            preference.Id
        );

        return preference;
    }

    public static bool IsCheckoutUrl(string? value) =>
        Uri.TryCreate(
            value,
            UriKind.Absolute,
            out var uri
        ) &&
        uri.Scheme == "https" &&
        (
            uri.Host == "www.mercadopago.com.br" ||
            uri.Host == "sandbox.mercadopago.com.br"
        ) &&
        string.IsNullOrEmpty(uri.UserInfo);

    private static void ValidatePublicUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        if (!Uri.TryCreate(
                value,
                UriKind.Absolute,
                out var uri
            ) ||
            uri.Scheme != "https" ||
            uri.IsLoopback ||
            !string.IsNullOrEmpty(uri.UserInfo))
        {
            throw new InvalidOperationException(
                "Checkout return URL must be a public HTTPS URL."
            );
        }
    }
}