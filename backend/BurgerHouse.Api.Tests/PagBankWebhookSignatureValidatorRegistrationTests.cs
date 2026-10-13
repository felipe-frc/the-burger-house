using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Api.Tests;

public sealed class PagBankWebhookSignatureValidatorRegistrationTests
{
    [Fact]
    public async Task ValidatorIsRegisteredAsSingleton()
    {
        var database =
            Path.Combine(
                Path.GetTempPath(),
                $"burger-webhook-validator-registration-{Guid.NewGuid()}.db"
            );

        try
        {
            await using var app =
                new WebApplicationFactory<Program>()
                    .WithWebHostBuilder(
                        builder =>
                        {
                            builder.UseEnvironment(
                                "Development"
                            );

                            builder.UseSetting(
                                "Privacy:EncryptionKey",
                                TestPersonalData.Key
                            );

                            builder.UseSetting(
                                "ConnectionStrings:DefaultConnection",
                                $"Data Source={database};Pooling=False"
                            );

                            builder.UseSetting(
                                "PagBank:Token",
                                "test-placeholder"
                            );

                            builder.UseSetting(
                                "PagBank:RedirectUrl",
                                "https://example.invalid/"
                            );

                            builder.UseSetting(
                                "PagBank:NotificationUrl",
                                "https://example.invalid/webhook"
                            );

                            builder.ConfigureLogging(
                                logging =>
                                    logging.ClearProviders()
                            );
                        }
                    );

            var first =
                app.Services.GetRequiredService<
                    PagBankWebhookSignatureValidator>();

            using var scope =
                app.Services.CreateScope();

            var second =
                scope.ServiceProvider.GetRequiredService<
                    PagBankWebhookSignatureValidator>();

            Assert.Same(
                first,
                second
            );
        }
        finally
        {
            foreach (var path in new[]
            {
                database,
                database + "-wal",
                database + "-shm"
            })
            {
                File.Delete(
                    path
                );
            }
        }
    }
}