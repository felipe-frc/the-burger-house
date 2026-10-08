using System.Net;
using System.Text.Json;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.FileProviders;

namespace BurgerHouse.Infrastructure.Tests.Payments.PagBank;

public class PagBankCheckoutServiceTests
{
    private static readonly HostedCheckoutCustomer Customer =
        new("Cliente Teste", "cliente@teste.com", "52998224725", "11999990000");

    [Theory]
    [InlineData(10)]
    [InlineData(17)]
    [InlineData(60)]
    public async Task CreatesCheckoutWithBearerReferenceCentsUrlsAndPayLinkByRelation(int emailLength)
    {
        var identity = Customer with { Email = new string('a', emailLength - 8) + "@test.co" };
        HttpRequestMessage? captured = null;
        string? requestBody = null;

        using var http = new HttpClient(new Stub(async request =>
        {
            captured = request;
            requestBody = await request.Content!.ReadAsStringAsync();

            return Json(
                HttpStatusCode.OK,
                """
                {
                  "id":"CHEC_1",
                  "reference_id":"payment:17",
                  "status":"ACTIVE",
                  "links":[
                    {
                      "rel":"SELF",
                      "href":"https://api.pagseguro.com/checkouts/CHEC_1"
                    },
                    {
                      "rel":"PAY",
                      "href":"https://pagamento.pagbank.com.br/checkout/CHEC_1"
                    }
                  ]
                }
                """
            );
        }));

        var payment = NewPayment();

        var result =
            await Service(http)
                .GetOrCreateAsync(payment, identity);

        Assert.Equal(
            HttpMethod.Post,
            captured!.Method
        );

        Assert.Equal(
            "https://sandbox.api.pagseguro.com/checkouts",
            captured.RequestUri!.ToString()
        );

        Assert.Equal(
            "Bearer",
            captured.Headers.Authorization!.Scheme
        );

        Assert.Equal(
            "local-test-token",
            captured.Headers.Authorization.Parameter
        );

        using var body =
            JsonDocument.Parse(
                requestBody!
            );

        Assert.Equal(
            "payment:17",
            body.RootElement
                .GetProperty("reference_id")
                .GetString()
        );

        var customer = body.RootElement.GetProperty("customer");
        Assert.Equal(identity.Name, customer.GetProperty("name").GetString());
        Assert.Equal(identity.Email, customer.GetProperty("email").GetString());
        Assert.Equal(identity.TaxId, customer.GetProperty("tax_id").GetString());
        Assert.Matches("^[0-9]{11}$", customer.GetProperty("tax_id").GetString()!);
        Assert.Equal(4, customer.EnumerateObject().Count());
        Assert.False(body.RootElement.GetProperty("customer_modifiable").GetBoolean());
        Assert.DoesNotContain(Customer.Email, captured.RequestUri.ToString());
        Assert.DoesNotContain(Customer.TaxId, captured.RequestUri.ToString());

        var item =
            Assert.Single(
                body.RootElement
                    .GetProperty("items")
                    .EnumerateArray()
            );

        Assert.Equal(
            "order:5",
            item.GetProperty("reference_id")
                .GetString()
        );

        Assert.Equal(
            1,
            item.GetProperty("quantity")
                .GetInt32()
        );

        Assert.Equal(
            4390,
            item.GetProperty("unit_amount")
                .GetInt32()
        );

        var paymentMethods =
            body.RootElement
                .GetProperty("payment_methods")
                .EnumerateArray()
                .Select(method =>
                    method.GetProperty("type")
                        .GetString()
                    ?? throw new InvalidOperationException(
                        "PagBank payment method type was null."
                    )
                )
                .ToArray();

        Assert.Equal(
            ["PIX", "CREDIT_CARD"],
            paymentMethods
        );

        Assert.Equal(
            "https://shop.example/return",
            body.RootElement
                .GetProperty("redirect_url")
                .GetString()
        );

        Assert.Equal(
            "https://shop.example/return",
            body.RootElement
                .GetProperty("return_url")
                .GetString()
        );

        Assert.Equal(
            "https://api.example/api/webhooks/pagbank",
            Assert.Single(
                    body.RootElement
                        .GetProperty("notification_urls")
                        .EnumerateArray()
                )
                .GetString()
        );

        Assert.Equal(
            "https://api.example/api/webhooks/pagbank",
            Assert.Single(
                    body.RootElement
                        .GetProperty("payment_notification_urls")
                        .EnumerateArray()
                )
                .GetString()
        );

        Assert.Equal(
            17,
            result.PaymentId
        );

        Assert.Equal(
            "CHEC_1",
            result.ExternalCheckoutId
        );

        Assert.Equal(
            "https://pagamento.pagbank.com.br/checkout/CHEC_1",
            result.CheckoutUrl
        );

        Assert.Equal(
            "CHEC_1",
            payment.ExternalCheckoutId
        );
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public async Task ExistingCheckoutIsReadInsteadOfCreated(int identityCase)
    {
        HttpRequestMessage? captured = null;
        var calls = 0;

        using var http = new HttpClient(new Stub(request =>
        {
            captured = request;
            calls++;
            Assert.Equal(HttpMethod.Get, request.Method);

            return Task.FromResult(
                Json(
                    HttpStatusCode.OK,
                    """
                    {
                      "id":"CHEC_1",
                      "reference_id":"payment:17",
                      "status":"ACTIVE",
                      "links":[
                        {
                          "rel":"PAY",
                          "href":"https://pagamento.sandbox.pagbank.com.br/pagamento?code=CHEC_1"
                        }
                      ]
                    }
                    """
                )
            );
        }));

        var payment = NewPayment();

        payment.SetExternalCheckoutId(
            "CHEC_1"
        );

        await Service(http)
            .GetOrCreateAsync(payment, identityCase switch
            {
                0 => null,
                1 => Customer,
                _ => Customer with { Email = new string('a', 61) + "@test.co" }
            });

        Assert.Equal(1, calls);
        Assert.Null(captured!.Content);

        Assert.Equal(
            HttpMethod.Get,
            captured!.Method
        );

        Assert.EndsWith(
            "/checkouts/CHEC_1",
            captured.RequestUri!.ToString(),
            StringComparison.Ordinal
        );
    }

    [Theory]
    [InlineData(
        "https://pagamento.pagbank.com.br/pagamento?code=teste",
        true
    )]
    [InlineData(
        "https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste",
        true
    )]
    [InlineData(
        "https://sandbox.pagseguro.uol.com.br/v2/checkout/payment.html?code=teste",
        false
    )]
    [InlineData(
        "https://pagseguro.uol.com.br/v2/checkout/payment.html?code=teste",
        false
    )]
    [InlineData(
        "https://pagamento.sandbox.pagbank.com.br.evil.example/pagamento?code=teste",
        false
    )]
    [InlineData(
        "http://pagamento.sandbox.pagbank.com.br/pagamento?code=teste",
        false
    )]
    [InlineData(
        "https://usuario:senha@pagamento.sandbox.pagbank.com.br/pagamento?code=teste",
        false
    )]
    public void AcceptsOnlyExactSecureCheckoutHosts(
        string url,
        bool expected)
    {
        Assert.Equal(
            expected,
            PagBankCheckoutService.IsCheckoutUrl(
                url
            )
        );
    }

    [Fact]
    public async Task AcceptsRealisticCurrentSandboxPayLink()
    {
        using var http = new HttpClient(new Stub(_ =>
            Task.FromResult(
                Json(
                    HttpStatusCode.OK,
                    """
                    {
                      "id":"CHEC_TESTE",
                      "reference_id":"payment:17",
                      "status":"ACTIVE",
                      "links":[
                        {
                          "rel":"SELF",
                          "href":"https://sandbox.api.pagseguro.com/checkouts/CHEC_TESTE",
                          "method":"GET"
                        },
                        {
                          "rel":"PAY",
                          "href":"https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste",
                          "method":"GET"
                        }
                      ]
                    }
                    """
                )
            )
        ));

        var result =
            await Service(http)
                .GetOrCreateAsync(
                    NewPayment(), Customer
                );

        Assert.Equal(
            "CHEC_TESTE",
            result.ExternalCheckoutId
        );

        Assert.Equal(
            "https://pagamento.sandbox.pagbank.com.br/pagamento?code=teste",
            result.CheckoutUrl
        );
    }

    [Fact]
    public async Task RejectsResponseWithoutSingleValidPayLink()
    {
        using var http = new HttpClient(new Stub(_ =>
            Task.FromResult(
                Json(
                    HttpStatusCode.OK,
                    """
                    {
                      "id":"CHEC_1",
                      "reference_id":"payment:17",
                      "status":"ACTIVE",
                      "links":[
                        {
                          "rel":"SELF",
                          "href":"https://api.pagseguro.com/checkouts/CHEC_1"
                        }
                      ]
                    }
                    """
                )
            )
        ));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () =>
                Service(http)
                    .GetOrCreateAsync(
                        NewPayment(), Customer
                    )
        );
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task ConvertsProviderErrorsToHttpRequestException(
        HttpStatusCode status)
    {
        using var http = new HttpClient(new Stub(_ =>
            Task.FromResult(
                Json(
                    status,
                    "{}"
                )
            )
        ));

        var exception =
            await Assert.ThrowsAsync<HttpRequestException>(
                () =>
                    Service(http)
                        .GetOrCreateAsync(
                            NewPayment(), Customer
                        )
            );

        Assert.Equal(
            status,
            exception.StatusCode
        );
    }

    [Fact]
    public async Task PropagatesTimeoutWithoutPersistingCheckout()
    {
        using var http = new HttpClient(new Stub(_ =>
            throw new TaskCanceledException(
                "timeout"
            )
        ));

        var payment = NewPayment();

        await Assert.ThrowsAsync<TaskCanceledException>(
            () =>
                Service(http)
                    .GetOrCreateAsync(
                        payment, Customer
                    )
        );

        Assert.Null(
            payment.ExternalCheckoutId
        );
    }

    [Fact]
    public async Task RejectsInvalidJson()
    {
        using var http = new HttpClient(new Stub(_ =>
            Task.FromResult(
                Json(
                    HttpStatusCode.OK,
                    "not-json"
                )
            )
        ));

        await Assert.ThrowsAsync<JsonException>(
            () =>
                Service(http)
                    .GetOrCreateAsync(
                        NewPayment(), Customer
                    )
        );
    }

    [Theory]
    [InlineData("customer", null)]
    [InlineData("name", null)]
    [InlineData("name", " ")]
    [InlineData("email", null)]
    [InlineData("email", "")]
    [InlineData("taxId", null)]
    [InlineData("taxId", " ")]
    public async Task IncompleteIdentityIsRejectedWithoutHttp(string field, string? value)
    {
        var identity = field switch
        {
            "name" => Customer with { Name = value! },
            "email" => Customer with { Email = value! },
            "taxId" => Customer with { TaxId = value! },
            _ => null
        };
        var calls = 0;
        using var http = new HttpClient(new Stub(_ =>
        {
            calls++;
            throw new InvalidOperationException("Unexpected HTTP call.");
        }));

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => Service(http).GetOrCreateAsync(NewPayment(), identity));

        Assert.Equal("Customer payment identity is incomplete.", error.Message);
        Assert.Equal(0, calls);
    }

    [Theory]
    [InlineData(9)]
    [InlineData(61)]
    [InlineData(254)]
    public async Task IncompatibleEmailIsRejectedWithoutHttpOrExposingIdentity(int length)
    {
        var identity = Customer with { Email = new string('a', length - 8) + "@test.co" };
        var calls = 0;
        using var http = new HttpClient(new Stub(_ =>
        {
            calls++;
            throw new InvalidOperationException("Unexpected HTTP call.");
        }));

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => Service(http).GetOrCreateAsync(NewPayment(), identity));

        Assert.Equal("Customer payment identity is incompatible with hosted checkout.", error.Message);
        Assert.DoesNotContain(identity.Name, error.Message);
        Assert.DoesNotContain(identity.Email, error.Message);
        Assert.DoesNotContain(identity.TaxId, error.Message);
        Assert.Equal(0, calls);
    }

    [Theory]
    [InlineData("Development", true)]
    [InlineData("Production", false)]
    [InlineData("Staging", false)]
    public async Task LogsOnlySafeTechnicalFieldsInDevelopment(string environment, bool logsExpected)
    {
        var logger = new RecordingLogger();
        using var http = new HttpClient(new Stub(_ => Task.FromResult(Json(HttpStatusCode.BadRequest,
            """
            {"error_messages":[
              {"error":"invalid_parameter","description":"must be between 10 and 60 characters","parameter_name":"customer.email","email":"cliente@teste.com"},
              {"error":"local-test-token","description":"Cliente Teste cliente@teste.com 52998224725","parameter_name":"Bearer local-test-token"},
              {"error":"invalid_parameter","description":"(34) 99999-9999","parameter_name":"customer.phone"}
            ],"Authorization":"Bearer local-test-token","payload":"secret"}
            """))));

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            Service(http, new TestEnvironment { EnvironmentName = environment }, logger)
                .GetOrCreateAsync(NewPayment(), Customer));

        Assert.Equal(HttpStatusCode.BadRequest, exception.StatusCode);
        Assert.Equal("PagBank checkout request failed with HTTP 400.", exception.Message);
        Assert.Equal(logsExpected, logger.Messages.Count > 0);
        var logs = string.Join("\n", logger.Messages);
        Assert.DoesNotContain("(34) 99999-9999", logs);
        if (logsExpected)
        {
            Assert.Contains("400", logs);
            Assert.Contains("invalid_parameter", logs);
            Assert.Contains("must be between 10 and 60 characters", logs);
            Assert.Contains("customer.email", logs);
            Assert.Contains("[redacted]", logs);
        }
        foreach (var sensitive in new[] { Customer.Name, Customer.Email, Customer.TaxId, "local-test-token", "Authorization", "Bearer", "secret" })
            Assert.DoesNotContain(sensitive, logs);
    }

    [Theory]
    [InlineData("not-json")]
    [InlineData("[]")]
    [InlineData("{\"error_messages\":[null,42,{\"description\":{\"secret\":\"value\"}}]}")]
    [InlineData("{\"error\":\"invalid_parameter\",\"description\":\"invalid format\",\"parameter_name\":\"customer.tax_id\"}")]
    public async Task DiagnosticParsingPreservesHttpFailure(string body)
    {
        var logger = new RecordingLogger();
        using var http = new HttpClient(new Stub(_ => Task.FromResult(Json(HttpStatusCode.BadRequest, body))));
        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            Service(http, new TestEnvironment(), logger).GetOrCreateAsync(NewPayment(), Customer));
        Assert.Equal(HttpStatusCode.BadRequest, exception.StatusCode);
        Assert.DoesNotContain("secret", string.Join("\n", logger.Messages));
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class RecordingLogger : ILogger<PagBankCheckoutService>
    {
        public List<string> Messages { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            => Messages.Add(formatter(state, exception));
    }

    [Theory]
    [InlineData("34999999999")]
    [InlineData("(34) 99999-9999")]
    [InlineData("34 99999-9999")]
    [InlineData("+55 34 99999-9999")]
    public async Task SendsNormalizedMobilePhone(string phone)
    {
        using var http = new HttpClient(new Stub(async request =>
        {
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            var customer = body.RootElement.GetProperty("customer");
            var actual = customer.GetProperty("phone");
            Assert.Equal("+55", actual.GetProperty("country").GetString());
            Assert.Equal("34", actual.GetProperty("area").GetString());
            Assert.Equal("999999999", actual.GetProperty("number").GetString());
            Assert.False(body.RootElement.GetProperty("customer_modifiable").GetBoolean());
            return Json(HttpStatusCode.BadRequest, "{}");
        }));
        await Assert.ThrowsAsync<HttpRequestException>(() =>
            Service(http).GetOrCreateAsync(NewPayment(), Customer with { Phone = phone }));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("123")]
    [InlineData("3433334444")]
    [InlineData("34888888888")]
    [InlineData("349999999999")]
    [InlineData("+54 34 99999-9999")]
    public async Task InvalidPhoneFailsBeforeHttpButDoesNotPreventReuse(string? phone)
    {
        var calls = 0;
        using var http = new HttpClient(new Stub(request =>
        {
            calls++;
            Assert.Equal(HttpMethod.Get, request.Method);
            return Task.FromResult(Json(HttpStatusCode.BadRequest, "{}"));
        }));
        var customer = Customer with { Phone = phone! };
        var payment = NewPayment();
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Service(http).GetOrCreateAsync(payment, customer));
        Assert.Equal("Customer payment identity is incompatible with hosted checkout.", error.Message);
        Assert.Equal(0, calls);
        payment.SetExternalCheckoutId("CHEC_1");
        await Assert.ThrowsAsync<HttpRequestException>(() => Service(http).GetOrCreateAsync(payment, customer));
        Assert.Equal(1, calls);
    }

    private static PagBankCheckoutService Service(
        HttpClient http,
        IHostEnvironment? environment = null,
        ILogger<PagBankCheckoutService>? logger = null)
    {
        return new PagBankCheckoutService(
            http,
            Options.Create(
                new PagBankOptions
                {
                    BaseUrl =
                        "https://sandbox.api.pagseguro.com",

                    Token =
                        "local-test-token",

                    RedirectUrl =
                        "https://shop.example/return",

                    NotificationUrl =
                        "https://api.example/api/webhooks/pagbank"
                }
            ),
            environment,
            logger
        );
    }

    private static Payment NewPayment()
    {
        var payment =
            new Payment(
                5,
                43.90m,
                Guid.NewGuid().ToString("D"),
                PaymentMethod.Unknown
            );

        typeof(Payment)
            .GetProperty(
                nameof(Payment.Id)
            )!
            .SetValue(
                payment,
                17
            );

        return payment;
    }

    private static HttpResponseMessage Json(
        HttpStatusCode status,
        string value)
    {
        return new HttpResponseMessage(
            status
        )
        {
            Content =
                new StringContent(
                    value,
                    System.Text.Encoding.UTF8,
                    "application/json"
                )
        };
    }

    private sealed class Stub(
        Func<
            HttpRequestMessage,
            Task<HttpResponseMessage>
        > send)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            return send(
                request
            );
        }
    }
}
