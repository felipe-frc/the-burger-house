using System.Globalization;
using System.Text.Json;
using BurgerHouse.Api.Webhooks.MercadoPago;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

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
    public async Task<IActionResult> Receive(
        [FromBody] MercadoPagoWebhookRequest request,
        CancellationToken ct)
    {
        var dataId =
            Request.Query["data.id"].FirstOrDefault();

        var queryType =
            Request.Query["type"].FirstOrDefault();

        var xSignature =
            Request.Headers["x-signature"].FirstOrDefault();

        var xRequestId =
            Request.Headers["x-request-id"].FirstOrDefault();

        logger?.LogInformation(
            "Mercado Pago webhook received. " +
            "QueryString: {QueryString}. " +
            "QueryDataId: {QueryDataId}. " +
            "BodyDataId: {BodyDataId}. " +
            "QueryType: {QueryType}. " +
            "BodyType: {BodyType}. " +
            "SignaturePresent: {SignaturePresent}. " +
            "RequestIdPresent: {RequestIdPresent}. " +
            "RequestId: {RequestId}.",
            Request.QueryString.Value,
            dataId ?? "(missing)",
            request.Data?.Id ?? "(missing)",
            queryType ?? "(missing)",
            request.Type ?? "(missing)",
            !string.IsNullOrWhiteSpace(xSignature),
            !string.IsNullOrWhiteSpace(xRequestId),
            xRequestId ?? "(missing)"
        );

        if (string.IsNullOrWhiteSpace(dataId))
        {
            return BadRequest(new
            {
                error = "Payment id is required."
            });
        }

        if (!signatureValidator.IsValid(
                xSignature,
                xRequestId,
                dataId))
        {
            logger?.LogWarning(
                "Mercado Pago webhook rejected by signature validation. " +
                "QueryDataId: {QueryDataId}. " +
                "BodyDataId: {BodyDataId}. " +
                "RequestId: {RequestId}.",
                dataId,
                request.Data?.Id ?? "(missing)",
                xRequestId ?? "(missing)"
            );

            return Unauthorized(new
            {
                error = "Invalid webhook signature."
            });
        }

        if (!string.IsNullOrWhiteSpace(request.Data?.Id) &&
            request.Data.Id != dataId)
        {
            logger?.LogWarning(
                "Mercado Pago webhook data id mismatch. " +
                "QueryDataId: {QueryDataId}. " +
                "BodyDataId: {BodyDataId}.",
                dataId,
                request.Data.Id
            );

            return BadRequest(new
            {
                error = "Webhook data id mismatch."
            });
        }

        var type = queryType;

        if (!string.IsNullOrWhiteSpace(type) &&
            !string.IsNullOrWhiteSpace(request.Type) &&
            type != request.Type)
        {
            logger?.LogWarning(
                "Mercado Pago webhook type mismatch. " +
                "QueryType: {QueryType}. " +
                "BodyType: {BodyType}.",
                type,
                request.Type
            );

            return BadRequest(new
            {
                error = "Webhook type mismatch."
            });
        }

        type ??= request.Type;

        if (type != "payment")
        {
            logger?.LogInformation(
                "Mercado Pago webhook ignored because type is not payment. " +
                "Type: {Type}.",
                type ?? "(missing)"
            );

            return Ok(new
            {
                received = true,
                ignored = true
            });
        }

        if (!long.TryParse(
                dataId,
                NumberStyles.None,
                CultureInfo.InvariantCulture,
                out var numericId) ||
            numericId <= 0)
        {
            logger?.LogWarning(
                "Mercado Pago webhook contains invalid numeric payment id. " +
                "DataId: {DataId}.",
                dataId
            );

            return BadRequest(new
            {
                error = "Invalid payment id."
            });
        }

        try
        {
            var snapshot =
                await paymentLookup.GetAsync(
                    dataId,
                    ct
                );

            if (snapshot is null ||
                snapshot.Id != dataId)
            {
                logger?.LogWarning(
                    "Mercado Pago payment lookup could not verify payment. " +
                    "WebhookDataId: {WebhookDataId}. " +
                    "LookupId: {LookupId}.",
                    dataId,
                    snapshot?.Id ?? "(null)"
                );

                return StatusCode(
                    502,
                    new
                    {
                        error =
                            "Could not verify the notified payment."
                    }
                );
            }

            if (!int.TryParse(
                    snapshot.ExternalReference,
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out var paymentId) ||
                paymentId <= 0)
            {
                logger?.LogWarning(
                    "Mercado Pago payment has invalid local reference. " +
                    "ExternalPaymentId: {ExternalPaymentId}. " +
                    "ExternalReference: {ExternalReference}.",
                    snapshot.Id,
                    snapshot.ExternalReference
                );

                return Conflict(new
                {
                    error =
                        "Invalid local payment reference."
                });
            }

            var method =
                MercadoPagoPaymentMethodMapper.Map(
                    snapshot.PaymentTypeId,
                    snapshot.PaymentMethodId
                );

            if (snapshot.CurrencyId != "BRL")
            {
                throw new InvalidOperationException(
                    "Payment currency is incompatible."
                );
            }

            logger?.LogInformation(
                "Mercado Pago payment verified. " +
                "ExternalPaymentId: {ExternalPaymentId}. " +
                "LocalPaymentId: {LocalPaymentId}. " +
                "ProviderStatus: {ProviderStatus}. " +
                "PaymentTypeId: {PaymentTypeId}. " +
                "PaymentMethodId: {PaymentMethodId}.",
                snapshot.Id,
                paymentId,
                snapshot.PaymentStatus,
                snapshot.PaymentTypeId,
                snapshot.PaymentMethodId
            );

            await using var transaction =
                await dbContext.Database
                    .BeginTransactionAsync(ct);

            var changed =
                await synchronizer.HandleAsync(
                    paymentId,
                    snapshot.Id,
                    snapshot.TransactionAmount,
                    snapshot.CurrencyId,
                    method,
                    snapshot.PaymentStatus,
                    ct
                );

            await transaction.CommitAsync(ct);

            logger?.LogInformation(
                "Mercado Pago payment synchronized successfully. " +
                "ExternalPaymentId: {ExternalPaymentId}. " +
                "LocalPaymentId: {LocalPaymentId}. " +
                "Changed: {Changed}.",
                snapshot.Id,
                paymentId,
                changed
            );

            return Ok(new
            {
                received = true,
                synchronized = changed
            });
        }
        catch (KeyNotFoundException exception)
        {
            logger?.LogWarning(
                exception,
                "Mercado Pago webhook could not find local payment/order. " +
                "ProviderPaymentId: {ProviderPaymentId}.",
                dataId
            );

            return Conflict(new
            {
                error =
                    "Local payment or order was not found."
            });
        }
        catch (InvalidOperationException exception)
        {
            logger?.LogWarning(
                exception,
                "Mercado Pago webhook rejected incompatible payment data. " +
                "ProviderPaymentId: {ProviderPaymentId}.",
                dataId
            );

            return Conflict(new
            {
                error =
                    "Payment data or transition is incompatible."
            });
        }
        catch (HttpRequestException exception)
        {
            logger?.LogWarning(
                exception,
                "Mercado Pago payment lookup failed. " +
                "ProviderPaymentId: {ProviderPaymentId}.",
                dataId
            );

            return StatusCode(
                502,
                new
                {
                    error =
                        "Payment verification failed."
                }
            );
        }
        catch (JsonException exception)
        {
            logger?.LogWarning(
                exception,
                "Mercado Pago payment lookup returned invalid JSON. " +
                "ProviderPaymentId: {ProviderPaymentId}.",
                dataId
            );

            return StatusCode(
                502,
                new
                {
                    error =
                        "Invalid provider response."
                }
            );
        }
        catch (TaskCanceledException exception)
            when (!ct.IsCancellationRequested)
        {
            logger?.LogWarning(
                exception,
                "Mercado Pago payment lookup timed out. " +
                "ProviderPaymentId: {ProviderPaymentId}.",
                dataId
            );

            return StatusCode(
                502,
                new
                {
                    error =
                        "Payment verification timed out."
                }
            );
        }
        catch (DbUpdateException exception)
        {
            logger?.LogError(
                exception,
                "Database update failed while processing Mercado Pago webhook. " +
                "ProviderPaymentId: {ProviderPaymentId}.",
                dataId
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
            logger?.LogError(
                exception,
                "SQLite failed while processing Mercado Pago webhook. " +
                "ProviderPaymentId: {ProviderPaymentId}. " +
                "SQLiteErrorCode: {SQLiteErrorCode}, " +
                "SQLiteExtendedErrorCode: {SQLiteExtendedErrorCode}.",
                dataId,
                exception.SqliteErrorCode,
                exception.SqliteExtendedErrorCode
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
}