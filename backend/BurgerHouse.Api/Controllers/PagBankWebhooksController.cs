using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using BurgerHouse.Api.Webhooks.PagBank;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/webhooks/pagbank")]
public sealed class PagBankWebhooksController(
    PagBankWebhookSignatureValidator signatureValidator,
    PagBankPaymentLookup paymentLookup,
    SynchronizeCheckoutPaymentHandler synchronizer,
    BurgerHouseDbContext dbContext,
    ILogger<PagBankWebhooksController>? logger = null) : ControllerBase
{
    private const int MaximumPayloadBytes = 256 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [HttpPost]
    [Consumes("application/json")]
    public async Task<IActionResult> Receive(CancellationToken ct)
    {
        try
        {
            var rawBody = await ReadBodyAsync(ct);
            var signatures = Request.Headers["x-payload-signature"].ToArray();
            if (!await signatureValidator.IsValidAsync(rawBody, signatures, ct))
                return Unauthorized(new { error = "Invalid webhook signature." });

            var webhook = JsonSerializer.Deserialize<PagBankWebhookRequest>(rawBody.Span, JsonOptions)
                ?? throw new JsonException("Webhook body is empty.");
            var chargeIds = webhook.Charges?
                .Select(charge => charge.Id?.Trim())
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct(StringComparer.Ordinal)
                .ToArray() ?? [];

            // Checkout lifecycle events contain no charge and do not change financial state.
            if (chargeIds.Length == 0)
                return Ok(new { received = true, ignored = true });
            if (chargeIds.Length != 1)
                return BadRequest(new { error = "Webhook must identify exactly one charge." });
            if (!TryGetPaymentId(webhook.ReferenceId, out var paymentId))
                return Conflict(new { error = "Invalid local payment reference." });
            if (string.IsNullOrWhiteSpace(webhook.Id))
                return Conflict(new { error = "Webhook resource id is missing." });

            var localPayment = await dbContext.Payments
                .AsNoTracking()
                .SingleOrDefaultAsync(payment => payment.Id == paymentId, ct);
            if (localPayment is null)
                return Conflict(new { error = "Local payment was not found." });
            if (localPayment.Provider != PaymentProvider.PagBank ||
                string.IsNullOrWhiteSpace(localPayment.ExternalCheckoutId))
                return Conflict(new { error = "Payment is not linked to a PagBank checkout." });

            var chargeId = chargeIds[0]!;
            PagBankPaymentSnapshot? snapshot;
            try
            {
                snapshot = await paymentLookup.GetAsync(chargeId, ct);
            }
            catch (Exception exception) when (exception is JsonException or InvalidOperationException)
            {
                return StatusCode(502, new { error = "PagBank returned an invalid payment response." });
            }
            if (snapshot is null || snapshot.Id != chargeId)
                return StatusCode(502, new { error = "Could not verify the notified payment." });
            if (!string.Equals(
                    snapshot.ReferenceId,
                    PagBankCheckoutService.CreateReference(paymentId),
                    StringComparison.Ordinal))
                return Conflict(new { error = "Payment reference is incompatible." });
            if (snapshot.Currency != "BRL")
                return Conflict(new { error = "Payment currency is incompatible." });

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
            if (currentPayment.Provider != PaymentProvider.PagBank ||
                string.IsNullOrWhiteSpace(currentPayment.ExternalCheckoutId) ||
                currentPayment.Amount != snapshot.Amount ||
                currentOrder.Total != snapshot.Amount ||
                (currentPayment.ExternalPaymentId is not null &&
                 !string.Equals(currentPayment.ExternalPaymentId, snapshot.Id, StringComparison.Ordinal)))
                return Conflict(new { error = "Payment correlation is incompatible." });

            var changed = await synchronizer.HandleAsync(
                paymentId,
                PaymentProvider.PagBank,
                snapshot.Id,
                snapshot.Amount,
                snapshot.Currency,
                snapshot.PaymentMethod,
                snapshot.PaymentStatus,
                ct
            );
            await transaction.CommitAsync(ct);

            logger?.LogInformation(
                "PagBank payment synchronized. LocalPaymentId: {LocalPaymentId}, ExternalPaymentId: {ExternalPaymentId}, Changed: {Changed}.",
                paymentId,
                snapshot.Id,
                changed
            );
            return Ok(new { received = true, synchronized = changed });
        }
        catch (KeyNotFoundException) { return Conflict(new { error = "Local payment or order was not found." }); }
        catch (InvalidOperationException) { return Conflict(new { error = "Payment data or transition is incompatible." }); }
        catch (HttpRequestException) { return StatusCode(502, new { error = "PagBank verification failed." }); }
        catch (JsonException) { return BadRequest(new { error = "Invalid webhook payload." }); }
        catch (CryptographicException) { return StatusCode(502, new { error = "Webhook signature verification failed." }); }
        catch (FormatException) { return StatusCode(502, new { error = "Webhook signature verification failed." }); }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return StatusCode(502, new { error = "PagBank verification timed out." });
        }
        catch (DbUpdateException) { return StatusCode(503, new { error = "Payment update must be retried." }); }
        catch (SqliteException) { return StatusCode(503, new { error = "Payment update must be retried." }); }
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
