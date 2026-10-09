using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Infrastructure.Payments.PagBank;

public sealed class PagBankCheckoutService : IHostedCheckoutGateway
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    private readonly HttpClient _httpClient;
    private readonly PagBankOptions _options;
    private readonly Uri _baseUri;
    private readonly IHostEnvironment? _environment;
    private readonly ILogger<PagBankCheckoutService>? _logger;

    public PagBankCheckoutService(
        HttpClient httpClient,
        IOptions<PagBankOptions> options,
        IHostEnvironment? environment = null,
        ILogger<PagBankCheckoutService>? logger = null)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);

        _httpClient = httpClient;
        _options = options.Value;
        _environment = environment;
        _logger = logger;

        _baseUri = ValidateBaseUrl(
            _options.BaseUrl
        );

        if (string.IsNullOrWhiteSpace(_options.Token))
        {
            throw new InvalidOperationException(
                "PagBank token was not configured."
            );
        }

        ValidatePublicUrl(
            _options.RedirectUrl,
            "redirect"
        );

        ValidatePublicUrl(
            _options.NotificationUrl,
            "notification"
        );
    }

    public async Task<HostedCheckoutSession> GetOrCreateAsync(
        Payment payment,
        HostedCheckoutCustomer? customer,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(payment);

        if (payment.Id <= 0)
        {
            throw new InvalidOperationException(
                "Payment must be persisted before creating checkout."
            );
        }

        var reference =
            CreateReference(payment.Id);

        PagBankCheckoutResponse checkout;

        if (payment.ExternalCheckoutId is not null)
        {
            using var request = CreateRequest(
                HttpMethod.Get,
                $"checkouts/{Uri.EscapeDataString(payment.ExternalCheckoutId)}"
            );

            checkout = await SendAsync(
                request,
                cancellationToken
            );
        }
        else
        {
            if (customer is null ||
                string.IsNullOrWhiteSpace(customer.Name) ||
                string.IsNullOrWhiteSpace(customer.Email) ||
                string.IsNullOrWhiteSpace(customer.TaxId))
            {
                throw new InvalidOperationException(
                    "Customer payment identity is incomplete."
                );
            }

            if (customer.Email.Length is < 10 or > 60 ||
                customer.TaxId.Length != 11 ||
                customer.TaxId.Any(character => !char.IsAsciiDigit(character)))
            {
                throw new InvalidOperationException(
                    "Customer payment identity is incompatible with hosted checkout."
                );
            }

            var phone = new string((customer.Phone ?? string.Empty).Where(char.IsAsciiDigit).ToArray());
            if (phone.Length == 13 && phone.StartsWith("55", StringComparison.Ordinal))
                phone = phone[2..];
            if (phone.Length != 11 || phone[2] != '9')
                throw new InvalidOperationException("Customer payment identity is incompatible with hosted checkout.");

            var unitAmount =
                ToCents(payment.Amount);

            var payload =
                new PagBankCheckoutRequest(
                    reference,
                    new PagBankCheckoutCustomer(
                        customer.Name,
                        customer.Email,
                        customer.TaxId,
                        new PagBankCheckoutPhone("+55", phone[..2], phone[2..])
                    ),
                    false,
                    [
                        new PagBankCheckoutItem(
                            $"order:{payment.OrderId}",
                            $"Pedido The Burger House #{payment.OrderId}",
                            1,
                            unitAmount
                        )
                    ],
                    [
                        new PagBankPaymentMethod(
                            "PIX"
                        ),
                        new PagBankPaymentMethod(
                            "CREDIT_CARD"
                        ),
                        new PagBankPaymentMethod(
                            "DEBIT_CARD"
                        )
                    ],
                    _options.RedirectUrl,
                    _options.RedirectUrl,
                    [_options.NotificationUrl],
                    [_options.NotificationUrl]
                );

            using var request =
                CreateRequest(
                    HttpMethod.Post,
                    "checkouts"
                );

            request.Content =
                JsonContent.Create(
                    payload,
                    options: JsonOptions
                );

            checkout = await SendAsync(
                request,
                cancellationToken
            );
        }

        if (string.IsNullOrWhiteSpace(checkout.Id) ||
            !string.Equals(
                checkout.ReferenceId,
                reference,
                StringComparison.Ordinal
            ))
        {
            throw new InvalidOperationException(
                "PagBank returned an incompatible checkout."
            );
        }

        if (!string.Equals(
                checkout.Status,
                "ACTIVE",
                StringComparison.OrdinalIgnoreCase
            ))
        {
            throw new InvalidOperationException(
                "PagBank checkout is not active."
            );
        }

        var payLinks =
            checkout.Links?
                .Where(link =>
                    string.Equals(
                        link.Rel,
                        "PAY",
                        StringComparison.OrdinalIgnoreCase
                    )
                )
                .ToArray()
            ?? [];

        if (payLinks.Length != 1 ||
            !IsCheckoutUrl(
                payLinks[0].Href
            ))
        {
            throw new InvalidOperationException(
                "PagBank returned no valid PAY link."
            );
        }

        payment.SetExternalCheckoutId(
            checkout.Id
        );

        return new HostedCheckoutSession(
            payment.Id,
            checkout.Id,
            payLinks[0].Href!
        );
    }

    public static string CreateReference(
        int paymentId)
    {
        return $"payment:{paymentId}";
    }

    public static bool IsCheckoutUrl(
        string? value)
    {
        return
            Uri.TryCreate(
                value,
                UriKind.Absolute,
                out var uri
            ) &&
            uri.Scheme == Uri.UriSchemeHttps &&
            string.IsNullOrEmpty(uri.UserInfo) &&
            uri.Host is
                "pagamento.pagbank.com.br"
                or
                "pagamento.sandbox.pagbank.com.br";
    }

    private HttpRequestMessage CreateRequest(
        HttpMethod method,
        string relativePath)
    {
        var request =
            new HttpRequestMessage(
                method,
                new Uri(
                    _baseUri,
                    relativePath
                )
            );

        request.Headers.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                _options.Token
            );

        request.Headers.Accept.Add(
            new MediaTypeWithQualityHeaderValue(
                "application/json"
            )
        );

        return request;
    }

    private async Task<PagBankCheckoutResponse> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        using var response =
            await _httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken
            );

        if (!response.IsSuccessStatusCode)
        {
            try
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                if (_environment?.IsDevelopment() == true)
                    LogProviderError(response.StatusCode, body);
            }
            catch (Exception exception) when (exception is HttpRequestException or IOException or OperationCanceledException)
            {
                // Diagnostic reads must not replace the existing HTTP failure.
            }

            throw new HttpRequestException(
                $"PagBank checkout request failed with HTTP {(int)response.StatusCode}.",
                null,
                response.StatusCode
            );
        }

        await using var stream =
            await response.Content.ReadAsStreamAsync(
                cancellationToken
            );

        return
            await JsonSerializer.DeserializeAsync<
                PagBankCheckoutResponse>(
                stream,
                JsonOptions,
                cancellationToken
            )
            ?? throw new JsonException(
                "PagBank returned an empty checkout response."
            );
    }

    private void LogProviderError(System.Net.HttpStatusCode status, string body)
    {
        _logger?.LogWarning("PagBank checkout failed with HTTP {StatusCode}.", (int)status);
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                return;

            if (root.TryGetProperty("error_messages", out var errors) &&
                errors.ValueKind == JsonValueKind.Array)
            {
                foreach (var error in errors.EnumerateArray())
                    LogTechnicalFields(error, status);
            }
            else
            {
                LogTechnicalFields(root, status);
            }
        }
        catch (JsonException)
        {
            // Non-JSON error bodies are never logged.
        }
    }

    private void LogTechnicalFields(JsonElement error, System.Net.HttpStatusCode status)
    {
        if (error.ValueKind != JsonValueKind.Object)
            return;

        _logger?.LogWarning(
            "PagBank checkout HTTP {StatusCode}: error={Error}, description={Description}, parameter_name={ParameterName}.",
            (int)status,
            SafeTechnicalField(error, "error"),
            SafeTechnicalField(error, "description"),
            SafeTechnicalField(error, "parameter_name"));
    }

    private static string? SafeTechnicalField(JsonElement error, string property)
    {
        if (!error.TryGetProperty(property, out var field) || field.ValueKind != JsonValueKind.String)
            return null;

        var value = field.GetString()!;
        // Provider descriptions can echo personal data. Only known technical vocabulary
        // is safe, including when reusing a historical checkout without customer data.
        const string vocabulary = "invalid required missing malformed unauthorized forbidden " +
            "bad request parameter parameters value values length size must be between and " +
            "is not valid allowed supported found minimum maximum min max characters digits " +
            "customer name email tax id modifiable payment methods type items reference " +
            "notification urls redirect return url phone number area country code " +
            "error errors format out of range cannot null empty too long short " +
            "unprocessable entity access denied internal server service unavailable";
        var words = value.Split([' ', '_', '-', '.', ':', ',', '[', ']', '(', ')'], StringSplitOptions.RemoveEmptyEntries);
        return value.Length <= 256 && value.Count(char.IsAsciiDigit) < 9 && words.Length > 0 && words.All(word =>
            vocabulary.Split(' ').Contains(word, StringComparer.OrdinalIgnoreCase) ||
            (word.Length <= 5 && word.All(char.IsAsciiDigit)))
            ? value
            : "[redacted]";
    }

    private static int ToCents(
        decimal amount)
    {
        var cents =
            amount * 100m;

        if (cents <= 0 ||
            cents != decimal.Truncate(cents) ||
            cents > int.MaxValue)
        {
            throw new InvalidOperationException(
                "Payment amount cannot be represented in cents."
            );
        }

        return checked(
            (int)cents
        );
    }

    private static Uri ValidateBaseUrl(
        string value)
    {
        if (!Uri.TryCreate(
                value,
                UriKind.Absolute,
                out var uri
            ) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
        {
            throw new InvalidOperationException(
                "PagBank base URL must be an HTTPS URL."
            );
        }

        return new Uri(
            uri.ToString()
                .TrimEnd('/') + "/"
        );
    }

    private static void ValidatePublicUrl(
        string value,
        string name)
    {
        if (!Uri.TryCreate(
                value,
                UriKind.Absolute,
                out var uri
            ) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            uri.IsLoopback ||
            !string.IsNullOrEmpty(uri.UserInfo))
        {
            throw new InvalidOperationException(
                $"PagBank {name} URL must be a public HTTPS URL."
            );
        }
    }

    private sealed record PagBankCheckoutRequest(
        [property: JsonPropertyName("reference_id")]
        string ReferenceId,

        [property: JsonPropertyName("customer")]
        PagBankCheckoutCustomer Customer,

        [property: JsonPropertyName("customer_modifiable")]
        bool CustomerModifiable,

        [property: JsonPropertyName("items")]
        PagBankCheckoutItem[] Items,

        [property: JsonPropertyName("payment_methods")]
        PagBankPaymentMethod[] PaymentMethods,

        [property: JsonPropertyName("redirect_url")]
        string RedirectUrl,

        [property: JsonPropertyName("return_url")]
        string ReturnUrl,

        [property: JsonPropertyName("notification_urls")]
        string[] NotificationUrls,

        [property: JsonPropertyName("payment_notification_urls")]
        string[] PaymentNotificationUrls
    );

    private sealed record PagBankCheckoutCustomer(
        [property: JsonPropertyName("name")]
        string Name,

        [property: JsonPropertyName("email")]
        string Email,

        [property: JsonPropertyName("tax_id")]
        string TaxId,

        [property: JsonPropertyName("phone")]
        PagBankCheckoutPhone Phone
    );

    private sealed record PagBankCheckoutPhone(
        [property: JsonPropertyName("country")] string Country,
        [property: JsonPropertyName("area")] string Area,
        [property: JsonPropertyName("number")] string Number
    );

    private sealed record PagBankCheckoutItem(
        [property: JsonPropertyName("reference_id")]
        string ReferenceId,

        [property: JsonPropertyName("name")]
        string Name,

        [property: JsonPropertyName("quantity")]
        int Quantity,

        [property: JsonPropertyName("unit_amount")]
        int UnitAmount
    );

    private sealed record PagBankPaymentMethod(
        [property: JsonPropertyName("type")]
        string Type
    );

    private sealed class PagBankCheckoutResponse
    {
        [JsonPropertyName("id")]
        public string? Id { get; init; }

        [JsonPropertyName("reference_id")]
        public string? ReferenceId { get; init; }

        [JsonPropertyName("status")]
        public string? Status { get; init; }

        [JsonPropertyName("links")]
        public PagBankLink[]? Links { get; init; }
    }

    private sealed class PagBankLink
    {
        [JsonPropertyName("rel")]
        public string? Rel { get; init; }

        [JsonPropertyName("href")]
        public string? Href { get; init; }
    }
}
