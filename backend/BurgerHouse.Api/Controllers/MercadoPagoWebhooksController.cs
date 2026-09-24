using System.Globalization;
using System.Text.Json;
using BurgerHouse.Api.Webhooks.MercadoPago;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Api.Controllers;

[ApiController]
[Route("api/webhooks/mercadopago")]
public sealed class MercadoPagoWebhooksController(
    MercadoPagoWebhookSignatureValidator signatureValidator,
    MercadoPagoPaymentLookup paymentLookup,
    SynchronizeCheckoutPaymentHandler synchronizer,
    BurgerHouseDbContext dbContext,
    ILogger<MercadoPagoWebhooksController>? logger = null) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Receive([FromBody] MercadoPagoWebhookRequest request, CancellationToken ct)
    {
        var dataId = Request.Query["data.id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(dataId)) return BadRequest(new { error = "Payment id is required." });
        if (!signatureValidator.IsValid(Request.Headers["x-signature"].FirstOrDefault(),
            Request.Headers["x-request-id"].FirstOrDefault(), dataId))
            return Unauthorized(new { error = "Invalid webhook signature." });
        if (!string.IsNullOrWhiteSpace(request.Data?.Id) && request.Data.Id != dataId)
            return BadRequest(new { error = "Webhook data id mismatch." });
        var type = Request.Query["type"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(type) && !string.IsNullOrWhiteSpace(request.Type) && type != request.Type)
            return BadRequest(new { error = "Webhook type mismatch." });
        type ??= request.Type;
        if (type != "payment") return Ok(new { received = true, ignored = true });
        if (!long.TryParse(dataId, NumberStyles.None, CultureInfo.InvariantCulture, out var numericId) || numericId <= 0)
            return BadRequest(new { error = "Invalid payment id." });

        try
        {
            var snapshot = await paymentLookup.GetAsync(dataId, ct);
            if (snapshot is null || snapshot.Id != dataId)
                return StatusCode(502, new { error = "Could not verify the notified payment." });
            if (!int.TryParse(snapshot.ExternalReference, NumberStyles.None, CultureInfo.InvariantCulture, out var paymentId) || paymentId <= 0)
                return Conflict(new { error = "Invalid local payment reference." });
            var method = MercadoPagoPaymentMethodMapper.Map(snapshot.PaymentTypeId, snapshot.PaymentMethodId);
            if (snapshot.CurrencyId != "BRL")
                throw new InvalidOperationException("Payment currency is incompatible.");

            await using var transaction = await dbContext.Database.BeginTransactionAsync(ct);
            var changed = await synchronizer.HandleAsync(paymentId, snapshot.Id, snapshot.TransactionAmount,
                snapshot.CurrencyId, method, snapshot.PaymentStatus, ct);
            await transaction.CommitAsync(ct);
            return Ok(new { received = true, synchronized = changed });
        }
        catch (KeyNotFoundException exception)
        {
            logger?.LogWarning(exception,
                "Mercado Pago webhook could not find local payment/order. ProviderPaymentId: {ProviderPaymentId}.",
                dataId);
            return Conflict(new { error = "Local payment or order was not found." });
        }
        catch (InvalidOperationException exception)
        {
            logger?.LogWarning(exception,
                "Mercado Pago webhook rejected incompatible payment data. ProviderPaymentId: {ProviderPaymentId}.",
                dataId);
            return Conflict(new { error = "Payment data or transition is incompatible." });
        }
        catch (HttpRequestException exception)
        {
            logger?.LogWarning(exception,
                "Mercado Pago payment lookup failed. ProviderPaymentId: {ProviderPaymentId}.",
                dataId);
            return StatusCode(502, new { error = "Payment verification failed." });
        }
        catch (JsonException exception)
        {
            logger?.LogWarning(exception,
                "Mercado Pago payment lookup returned invalid JSON. ProviderPaymentId: {ProviderPaymentId}.",
                dataId);
            return StatusCode(502, new { error = "Invalid provider response." });
        }
        catch (TaskCanceledException exception) when (!ct.IsCancellationRequested)
        {
            logger?.LogWarning(exception,
                "Mercado Pago payment lookup timed out. ProviderPaymentId: {ProviderPaymentId}.",
                dataId);
            return StatusCode(502, new { error = "Payment verification timed out." });
        }
        catch (DbUpdateException exception)
        {
            logger?.LogError(exception,
                "Database update failed while processing Mercado Pago webhook. ProviderPaymentId: {ProviderPaymentId}.",
                dataId);
            return StatusCode(503, new { error = "Payment update must be retried." });
        }
        catch (SqliteException exception)
        {
            logger?.LogError(exception,
                "SQLite failed while processing Mercado Pago webhook. ProviderPaymentId: {ProviderPaymentId}. SQLiteErrorCode: {SQLiteErrorCode}, SQLiteExtendedErrorCode: {SQLiteExtendedErrorCode}.",
                dataId,
                exception.SqliteErrorCode,
                exception.SqliteExtendedErrorCode);
            return StatusCode(503, new { error = "Payment update must be retried." });
        }
    }
}
