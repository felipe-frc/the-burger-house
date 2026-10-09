using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using BurgerHouse.Api.Webhooks.PagBank;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/webhooks/pagbank")]
public sealed class PagBankWebhooksController(
    PagBankWebhookSignatureValidator signatureValidator,
    PagBankPaymentLookup paymentLookup,
    SynchronizeCheckoutPaymentHandler synchronizer,
    BurgerHouseDbContext dbContext,
    ILogger<PagBankWebhooksController>? logger = null,
    IOptions<PagBankOptions>? pagBankOptions = null) : ControllerBase
{
    private const int MaximumPayloadBytes = 256 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [HttpPost]
    [Consumes("application/json")]
    public async Task<IActionResult> Receive(CancellationToken ct)
    {
        var stage = "received";
        logger?.LogDebug("PagBank webhook stage: {Stage}.", stage);
        try
        {
            var rawBody = await ReadBodyAsync(ct);
            var signatures = Request.Headers["x-payload-signature"].ToArray();
            try
            {
                // An explicitly configured Sandbox endpoint permits this opt-in on hosted
                // test environments too. A present (even empty) header never bypasses validation.
                var options = pagBankOptions?.Value;
                var allowUnsigned = !Request.Headers.ContainsKey("x-payload-signature") &&
                    signatures.Length == 0 &&
                    options?.AllowUnsignedSandboxWebhooks == true &&
                    (string.Equals(options.BaseUrl, "https://sandbox.api.pagseguro.com/", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(options.BaseUrl, "https://sandbox.api.pagseguro.com", StringComparison.OrdinalIgnoreCase));
                if (allowUnsigned)
                {
                    logger?.LogWarning("PagBank unsigned sandbox webhook accepted by explicit development override.");
                }
                else if (!await signatureValidator.IsValidAsync(rawBody, signatures, ct))
                {
                    logger?.LogWarning("PagBank webhook signature validation failed.");
                    return Unauthorized(new { error = "Invalid webhook signature." });
                }
            }
            catch (HttpRequestException)
            {
                logger?.LogError("PagBank webhook public key verification unavailable.");
                return StatusCode(502, new { error = "PagBank verification failed." });
            }

            stage = "signature-accepted";
            logger?.LogDebug("PagBank webhook stage: {Stage}.", stage);
            var webhook = JsonSerializer.Deserialize<PagBankWebhookRequest>(rawBody.Span, JsonOptions)
                ?? throw new JsonException("Webhook body is empty.");

            // Checkout lifecycle events contain no financial charge.
            if (webhook.Charges is null || webhook.Charges.Length == 0)
                return Ok(new { received = true, ignored = true });
            if (string.IsNullOrWhiteSpace(webhook.Id) ||
                !webhook.Id.StartsWith("ORDE_", StringComparison.Ordinal))
                return Conflict(new { error = "Webhook external order id is invalid." });
            if (!TryGetPaymentId(webhook.ReferenceId, out var paymentId))
                return Conflict(new { error = "Invalid local payment reference." });

            var localPayment = await dbContext.Payments
                .AsNoTracking()
                .SingleOrDefaultAsync(payment => payment.Id == paymentId, ct);
            if (localPayment is null)
                return Conflict(new { error = "Local payment was not found." });
            if (string.IsNullOrWhiteSpace(localPayment.ExternalCheckoutId))
                return Conflict(new { error = "Payment is not linked to a PagBank checkout." });

            if (!TrySelectCharge(localPayment, webhook.Charges, out var notifiedCharge, out var selectionReason))
            {
                logger?.LogWarning(
                    "PagBank webhook charge selection rejected. PaymentId: {PaymentId}, ExternalOrderId: {ExternalOrderId}, ExternalPaymentId: {ExternalPaymentId}, Reason: {Reason}.",
                    paymentId,
                    webhook.Id,
                    localPayment.ExternalPaymentId,
                    selectionReason
                );
                return Conflict(new { error = "Webhook charge selection is incompatible." });
            }

            PagBankPaymentSnapshot? snapshot;
            stage = "charge-correlated";
            logger?.LogDebug("PagBank webhook stage: {Stage}.", stage);
            try
            {
                snapshot = await paymentLookup.GetAsync(notifiedCharge!.Id!, ct);
            }
            catch (Exception exception) when (exception is JsonException or InvalidOperationException)
            {
                return StatusCode(502, new { error = "PagBank returned an invalid payment response." });
            }
            if (snapshot is null || !string.Equals(snapshot.Id, notifiedCharge.Id, StringComparison.Ordinal))
                return StatusCode(502, new { error = "Could not verify the notified payment." });
            stage = "snapshot-obtained";
            logger?.LogDebug("PagBank webhook stage: {Stage}, MappedStatus: {MappedStatus}.", stage, snapshot.PaymentStatus);
            if (!string.Equals(
                    snapshot.ReferenceId,
                    PagBankCheckoutService.CreateReference(paymentId),
                    StringComparison.Ordinal))
                return Conflict(new { error = "Payment reference is incompatible." });
            if (snapshot.Amount != localPayment.Amount ||
                !string.Equals(snapshot.Currency, "BRL", StringComparison.Ordinal))
                return Conflict(new { error = "Payment amount or currency is incompatible." });
            if (string.Equals(snapshot.ProviderStatus, "PAID", StringComparison.OrdinalIgnoreCase) &&
                snapshot.PaymentMethod == PaymentMethod.Unknown)
                return Conflict(new { error = "Paid payment method is unsupported." });

            await using var transaction = await dbContext.Database.BeginTransactionAsync(ct);
            var currentPayment = await dbContext.Payments
                .SingleOrDefaultAsync(payment => payment.Id == paymentId, ct);
            if (currentPayment is null)
                return Conflict(new { error = "Local payment was not found." });
            var currentOrder = await dbContext.Orders
                .Include(order => order.Items)
                .SingleOrDefaultAsync(order => order.Id == currentPayment.OrderId, ct);
            if (currentOrder is null)
                return Conflict(new { error = "Payment order was not found." });
            if (string.IsNullOrWhiteSpace(currentPayment.ExternalCheckoutId) ||
                currentPayment.Amount != snapshot.Amount ||
                currentOrder.Total != snapshot.Amount ||
                (currentPayment.ExternalPaymentId is not null &&
                 !string.Equals(currentPayment.ExternalPaymentId, snapshot.Id, StringComparison.Ordinal)))
                return Conflict(new { error = "Payment correlation is incompatible." });

            stage = "synchronizing";
            logger?.LogDebug("PagBank webhook stage: {Stage}.", stage);
            var changed = await synchronizer.HandleAsync(
                paymentId,
                snapshot.Id,
                snapshot.Amount,
                snapshot.Currency,
                snapshot.PaymentMethod,
                snapshot.PaymentStatus,
                ct,
                refundedAmount: snapshot.RefundedAmountInCents / 100m
            );
            stage = "synchronized";
            logger?.LogDebug(
                "PagBank webhook stage: {Stage}, PaymentStatus: {PaymentStatus}, OrderStatus: {OrderStatus}, Saved: {Saved}.",
                stage, currentPayment.Status, currentOrder.Status, changed);
            await transaction.CommitAsync(ct);
            stage = "committed";
            logger?.LogDebug("PagBank webhook stage: {Stage}.", stage);

            logger?.LogInformation(
                "PagBank payment synchronized. PaymentId: {PaymentId}, ExternalOrderId: {ExternalOrderId}, ExternalPaymentId: {ExternalPaymentId}, ProviderStatus: {ProviderStatus}, Changed: {Changed}.",
                paymentId,
                webhook.Id,
                snapshot.Id,
                snapshot.ProviderStatus,
                changed
            );
            return Ok(new { received = true, synchronized = changed });
        }
        catch (KeyNotFoundException) { return Conflict(new { error = "Local payment or order was not found." }); }
        catch (InvalidOperationException)
        {
            logger?.LogWarning("PagBank webhook rejected an operation at stage: {Stage}.", stage);
            return Conflict(new { error = "Payment data or transition is incompatible." });
        }
        catch (HttpRequestException) { return StatusCode(502, new { error = "PagBank verification failed." }); }
        catch (JsonException) { return BadRequest(new { error = "Invalid webhook payload." }); }
        catch (CryptographicException) { return StatusCode(502, new { error = "Webhook signature verification failed." }); }
        catch (FormatException) { return StatusCode(502, new { error = "Webhook signature verification failed." }); }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return StatusCode(502, new { error = "PagBank verification timed out." });
        }
        catch (DbUpdateConcurrencyException)
        {
            logger?.LogWarning("PagBank webhook concurrency conflict at stage: {Stage}; transaction was not committed.", stage);
            return StatusCode(503, new { error = "Payment update must be retried." });
        }
        catch (DbUpdateException)
        {
            logger?.LogWarning("PagBank webhook persistence failure at stage: {Stage}; transaction was not committed.", stage);
            return StatusCode(503, new { error = "Payment update must be retried." });
        }
        catch (SqliteException exception)
        {
            logger?.LogWarning("PagBank webhook SQLite failure at stage: {Stage}, Code: {Code}; transaction was not committed.", stage, exception.SqliteErrorCode);
            return StatusCode(503, new { error = "Payment update must be retried." });
        }
    }

    private static bool TrySelectCharge(
        Payment payment,
        IReadOnlyCollection<PagBankWebhookCharge> charges,
        out PagBankWebhookCharge? selected,
        out string reason)
    {
        selected = null;
        if (!TryGetAmountInCents(payment.Amount, out var expectedAmount))
        {
            reason = "invalid-local-amount";
            return false;
        }

        if (payment.ExternalPaymentId is not null)
        {
            var identified = charges
                .Where(charge => string.Equals(charge.Id?.Trim(), payment.ExternalPaymentId, StringComparison.Ordinal))
                .ToArray();
            if (identified.Length == 0)
            {
                reason = "external-payment-id-not-found";
                return false;
            }
            if (identified.Length != 1 ||
                !IsValidCandidate(identified[0], payment.Id, expectedAmount))
            {
                reason = "external-payment-id-incompatible";
                return false;
            }

            selected = identified[0];
            reason = string.Empty;
            return true;
        }

        var candidates = charges
            .Where(charge => IsValidCandidate(charge, payment.Id, expectedAmount))
            .ToArray();
        if (candidates.Length == 0)
        {
            reason = "matching-charge-not-found";
            return false;
        }

        var paid = candidates.Where(charge => HasStatus(charge, "PAID")).ToArray();
        if (paid.Length > 0)
            return TrySelectOnly(paid, out selected, out reason);

        var pending = candidates.Where(charge =>
            HasStatus(charge, "AUTHORIZED") ||
            HasStatus(charge, "IN_ANALYSIS") ||
            HasStatus(charge, "WAITING")).ToArray();
        if (pending.Length > 0)
            return TrySelectOnly(pending, out selected, out reason);

        var terminal = candidates.Where(charge =>
            HasStatus(charge, "DECLINED") ||
            HasStatus(charge, "CANCELED")).ToArray();
        return TrySelectOnly(terminal, out selected, out reason);
    }

    private static bool IsValidCandidate(PagBankWebhookCharge charge, int paymentId, int expectedAmount)
    {
        if (string.IsNullOrWhiteSpace(charge.Id) ||
            !charge.Id.Trim().StartsWith("CHAR_", StringComparison.Ordinal) ||
            !string.Equals(
                charge.ReferenceId?.Trim(),
                PagBankCheckoutService.CreateReference(paymentId),
                StringComparison.Ordinal) ||
            charge.Amount?.Value != expectedAmount ||
            !string.Equals(charge.Amount.Currency?.Trim(), "BRL", StringComparison.Ordinal) ||
            string.IsNullOrWhiteSpace(charge.Status))
            return false;

        var total = charge.Amount.Summary?.Total ?? charge.Amount.Value.Value;
        var refunded = charge.Amount.Summary?.Refunded ?? 0;
        _ = PagBankPaymentStatusMapper.Map(charge.Status, total, refunded);
        var method = PagBankPaymentMethodMapper.Map(
            charge.PaymentMethod?.Type,
            charge.PaymentMethod?.Card?.Product
        );
        return !HasStatus(charge, "PAID") || method != PaymentMethod.Unknown;
    }

    private static bool TrySelectOnly(
        IReadOnlyCollection<PagBankWebhookCharge> candidates,
        out PagBankWebhookCharge? selected,
        out string reason)
    {
        selected = candidates.Count == 1 ? candidates.Single() : null;
        reason = selected is null ? "ambiguous-charge" : string.Empty;
        return selected is not null;
    }

    private static bool HasStatus(PagBankWebhookCharge charge, string status) =>
        string.Equals(charge.Status?.Trim(), status, StringComparison.OrdinalIgnoreCase);

    private static bool TryGetAmountInCents(decimal amount, out int cents)
    {
        var value = amount * 100m;
        if (value <= 0 || value != decimal.Truncate(value) || value > int.MaxValue)
        {
            cents = 0;
            return false;
        }

        cents = checked((int)value);
        return true;
    }

    private async Task<ReadOnlyMemory<byte>> ReadBodyAsync(CancellationToken ct)
    {
        if (Request.ContentLength > MaximumPayloadBytes)
            throw new JsonException("Webhook payload is too large.");
        await using var buffer = new MemoryStream();
        await Request.Body.CopyToAsync(buffer, ct);
        if (buffer.Length == 0 || buffer.Length > MaximumPayloadBytes)
            throw new JsonException("Webhook payload is empty or too large.");
        return buffer.ToArray();
    }

    private static bool TryGetPaymentId(string? reference, out int paymentId)
    {
        paymentId = 0;
        const string prefix = "payment:";
        return reference is not null &&
               reference.StartsWith(prefix, StringComparison.Ordinal) &&
               int.TryParse(reference[prefix.Length..], NumberStyles.None, CultureInfo.InvariantCulture, out paymentId) &&
               paymentId > 0;
    }
}
