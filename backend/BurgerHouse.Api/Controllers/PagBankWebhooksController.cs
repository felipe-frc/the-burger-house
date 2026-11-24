using System.Security.Cryptography;
using System.Text.Json;
using BurgerHouse.Api.Webhooks.PagBank;
using BurgerHouse.Application.Payments.ProcessPaymentWebhook;
using BurgerHouse.Infrastructure.Payments.PagBank;
using Microsoft.AspNetCore.Mvc;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/webhooks/pagbank")]
[Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("PagBankWebhook")]
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
    [RequestSizeLimit(MaximumPayloadBytes)]
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
                // Sandbox is not an authentication exemption. Keep the legacy setting
                // readable for existing configuration, but never use it to authorize a body.
                if (pagBankOptions?.Value.AllowUnsignedSandboxWebhooks == true)
                    logger?.LogWarning("Legacy unsigned webhook configuration ignored; a valid signature is required.");

                if (!await signatureValidator.IsValidAsync(rawBody, signatures, cancellationToken))
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
        catch (DbException exception)
        {
            logger?.LogWarning(
                "PagBank webhook database failure at stage: {Stage}, Code: {Code}; transaction was not committed.",
                stage,
                exception.ErrorCode
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

        // Content-Length is optional. Stop at limit + 1 even for chunked streams,
        // rather than buffering an unbounded body before checking its length.
        var chunk = new byte[8192];
        while (true)
        {
            var remaining = MaximumPayloadBytes + 1 - (int)buffer.Length;
            var read = await Request.Body.ReadAsync(chunk.AsMemory(0, Math.Min(chunk.Length, remaining)), cancellationToken);
            if (read == 0) break;
            await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
            if (buffer.Length > MaximumPayloadBytes)
                throw new JsonException("Webhook payload is too large.");
        }

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
