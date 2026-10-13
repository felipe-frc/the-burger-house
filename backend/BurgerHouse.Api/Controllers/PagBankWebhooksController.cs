using System.Security.Cryptography;
using System.Text.Json;
using BurgerHouse.Api.Webhooks.PagBank;
using BurgerHouse.Application.Payments.ProcessPaymentWebhook;
using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/webhooks/pagbank")]
public sealed class PagBankWebhooksController(
    PagBankWebhookSignatureValidator signatureValidator,
    ProcessPaymentWebhookHandler webhookHandler,
    ILogger<PagBankWebhooksController>? logger = null,
    IOptions<PagBankOptions>? pagBankOptions = null)
    : ControllerBase
{
    private const int MaximumPayloadBytes =
        256 * 1024;

    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    [HttpPost]
    [Consumes("application/json")]
    public async Task<IActionResult> Receive(
        CancellationToken cancellationToken)
    {
        var stage =
            "received";

        logger?.LogDebug(
            "PagBank webhook stage: {Stage}.",
            stage
        );

        try
        {
            var rawBody =
                await ReadBodyAsync(
                    cancellationToken
                );

            var signatures =
                Request.Headers[
                    "x-payload-signature"
                ].ToArray();

            try
            {
                var options =
                    pagBankOptions?.Value;

                // An explicitly configured Sandbox endpoint permits this opt-in on hosted
                // test environments too. A present (even empty) header never bypasses validation.
                var allowUnsigned =
                    !Request.Headers.ContainsKey(
                        "x-payload-signature"
                    ) &&
                    signatures.Length == 0 &&
                    options?.AllowUnsignedSandboxWebhooks ==
                        true &&
                    (
                        string.Equals(
                            options.BaseUrl,
                            "https://sandbox.api.pagseguro.com/",
                            StringComparison.OrdinalIgnoreCase
                        ) ||
                        string.Equals(
                            options.BaseUrl,
                            "https://sandbox.api.pagseguro.com",
                            StringComparison.OrdinalIgnoreCase
                        )
                    );

                if (allowUnsigned)
                {
                    logger?.LogWarning(
                        "PagBank unsigned sandbox webhook accepted by explicit development override."
                    );
                }
                else if (!await signatureValidator.IsValidAsync(
                             rawBody,
                             signatures,
                             cancellationToken
                         ))
                {
                    logger?.LogWarning(
                        "PagBank webhook signature validation failed."
                    );

                    return Unauthorized(
                        new
                        {
                            error =
                                "Invalid webhook signature."
                        }
                    );
                }
            }
            catch (HttpRequestException)
            {
                logger?.LogError(
                    "PagBank webhook public key verification unavailable."
                );

                return StatusCode(
                    502,
                    new
                    {
                        error =
                            "PagBank verification failed."
                    }
                );
            }

            stage =
                "signature-accepted";

            logger?.LogDebug(
                "PagBank webhook stage: {Stage}.",
                stage
            );

            var webhook =
                JsonSerializer.Deserialize<PagBankWebhookRequest>(
                    rawBody.Span,
                    JsonOptions
                )
                ?? throw new JsonException(
                    "Webhook body is empty."
                );

            // Checkout lifecycle events contain no financial charge.
            if (webhook.Charges is null ||
                webhook.Charges.Length == 0)
            {
                return Ok(
                    new
                    {
                        received = true,
                        ignored = true
                    }
                );
            }

            var command =
                new ProcessPaymentWebhookCommand(
                    webhook.Id,
                    webhook.ReferenceId,
                    webhook.Charges
                        .Select(MapCharge)
                        .ToArray()
                );

            stage =
                "processing";

            logger?.LogDebug(
                "PagBank webhook stage: {Stage}.",
                stage
            );

            var result =
                await webhookHandler.HandleAsync(
                    command,
                    cancellationToken
                );

            stage =
                "processed";

            logger?.LogDebug(
                "PagBank webhook stage: {Stage}, Saved: {Saved}.",
                stage,
                result.Synchronized
            );

            logger?.LogInformation(
                "PagBank webhook processed. Synchronized: {Synchronized}.",
                result.Synchronized
            );

            return Ok(
                new
                {
                    received = true,
                    synchronized =
                        result.Synchronized
                }
            );
        }
        catch (PaymentProviderVerificationException)
        {
            logger?.LogWarning(
                "PagBank webhook provider verification failed at stage: {Stage}.",
                stage
            );

            return StatusCode(
                502,
                new
                {
                    error =
                        "PagBank returned an invalid payment response."
                }
            );
        }
        catch (KeyNotFoundException)
        {
            return Conflict(
                new
                {
                    error =
                        "Local payment or order was not found."
                }
            );
        }
        catch (InvalidOperationException)
        {
            logger?.LogWarning(
                "PagBank webhook rejected an operation at stage: {Stage}.",
                stage
            );

            return Conflict(
                new
                {
                    error =
                        "Payment data or transition is incompatible."
                }
            );
        }
        catch (HttpRequestException)
        {
            return StatusCode(
                502,
                new
                {
                    error =
                        "PagBank verification failed."
                }
            );
        }
        catch (JsonException)
        {
            return BadRequest(
                new
                {
                    error =
                        "Invalid webhook payload."
                }
            );
        }
        catch (CryptographicException)
        {
            return StatusCode(
                502,
                new
                {
                    error =
                        "Webhook signature verification failed."
                }
            );
        }
        catch (FormatException)
        {
            return StatusCode(
                502,
                new
                {
                    error =
                        "Webhook signature verification failed."
                }
            );
        }
        catch (TaskCanceledException)
            when (!cancellationToken.IsCancellationRequested)
        {
            return StatusCode(
                502,
                new
                {
                    error =
                        "PagBank verification timed out."
                }
            );
        }
        catch (DbUpdateConcurrencyException)
        {
            logger?.LogWarning(
                "PagBank webhook concurrency conflict at stage: {Stage}; transaction was not committed.",
                stage
            );

            return StatusCode(
                503,
                new
                {
                    error =
                        "Payment update must be retried."
                }
            );
        }
        catch (DbUpdateException)
        {
            logger?.LogWarning(
                "PagBank webhook persistence failure at stage: {Stage}; transaction was not committed.",
                stage
            );

            return StatusCode(
                503,
                new
                {
                    error =
                        "Payment update must be retried."
                }
            );
        }
        catch (SqliteException exception)
        {
            logger?.LogWarning(
                "PagBank webhook SQLite failure at stage: {Stage}, Code: {Code}; transaction was not committed.",
                stage,
                exception.SqliteErrorCode
            );

            return StatusCode(
                503,
                new
                {
                    error =
                        "Payment update must be retried."
                }
            );
        }
    }

    private static PaymentWebhookCharge MapCharge(
        PagBankWebhookCharge charge)
    {
        return new PaymentWebhookCharge(
            charge.Id,
            charge.ReferenceId,
            charge.Status,
            charge.Amount?.Value,
            charge.Amount?.Currency,
            charge.Amount?.Summary?.Total,
            charge.Amount?.Summary?.Refunded,
            charge.PaymentMethod?.Type,
            charge.PaymentMethod?.Card?.Product
        );
    }

    private async Task<ReadOnlyMemory<byte>> ReadBodyAsync(
        CancellationToken cancellationToken)
    {
        if (Request.ContentLength >
            MaximumPayloadBytes)
        {
            throw new JsonException(
                "Webhook payload is too large."
            );
        }

        await using var buffer =
            new MemoryStream();

        await Request.Body.CopyToAsync(
            buffer,
            cancellationToken
        );

        if (buffer.Length == 0 ||
            buffer.Length > MaximumPayloadBytes)
        {
            throw new JsonException(
                "Webhook payload is empty or too large."
            );
        }

        return buffer.ToArray();
    }
}