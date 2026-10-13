using System.Globalization;
using System.Text.Json;
using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Payments.SynchronizeCheckoutPayment;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;

namespace BurgerHouse.Application.Payments.ProcessPaymentWebhook;

public sealed class ProcessPaymentWebhookHandler(
    IPaymentRepository paymentRepository,
    IPaymentProviderLookup paymentProviderLookup,
    SynchronizeCheckoutPaymentHandler synchronizer,
    IUnitOfWork unitOfWork)
{
    public async Task<ProcessPaymentWebhookResult> HandleAsync(
        ProcessPaymentWebhookCommand command,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(
            command
        );

        if (string.IsNullOrWhiteSpace(
                command.ExternalOrderId
            ) ||
            !command.ExternalOrderId.StartsWith(
                "ORDE_",
                StringComparison.Ordinal
            ))
        {
            throw new InvalidOperationException(
                "Webhook external order id is invalid."
            );
        }

        if (!TryGetPaymentId(
                command.ReferenceId,
                out var paymentId
            ))
        {
            throw new InvalidOperationException(
                "Invalid local payment reference."
            );
        }

        var localPayment =
            await paymentRepository.GetByIdAsync(
                paymentId,
                cancellationToken
            )
            ?? throw new KeyNotFoundException(
                "Local payment was not found."
            );

        if (string.IsNullOrWhiteSpace(
                localPayment.ExternalCheckoutId
            ))
        {
            throw new InvalidOperationException(
                "Payment is not linked to a PagBank checkout."
            );
        }

        if (!TrySelectCharge(
                localPayment,
                command.Charges,
                out var notifiedCharge
            ))
        {
            throw new InvalidOperationException(
                "Webhook charge selection is incompatible."
            );
        }

        PaymentProviderSnapshot? snapshot;

        try
        {
            snapshot =
                await paymentProviderLookup.GetAsync(
                    notifiedCharge!.Id!,
                    cancellationToken
                );
        }
        catch (Exception exception)
            when (exception is InvalidOperationException or JsonException)
        {
            throw new PaymentProviderVerificationException(
                "Payment provider returned an invalid response.",
                exception
            );
        }

        if (snapshot is null ||
            !string.Equals(
                snapshot.Id,
                notifiedCharge.Id,
                StringComparison.Ordinal
            ))
        {
            throw new PaymentProviderVerificationException(
                "Could not verify the notified payment."
            );
        }

        if (!string.Equals(
                snapshot.ReferenceId,
                CreateReference(
                    paymentId
                ),
                StringComparison.Ordinal
            ))
        {
            throw new InvalidOperationException(
                "Payment reference is incompatible."
            );
        }

        if (snapshot.Amount !=
                localPayment.Amount ||
            !string.Equals(
                snapshot.Currency,
                "BRL",
                StringComparison.Ordinal
            ))
        {
            throw new InvalidOperationException(
                "Payment amount or currency is incompatible."
            );
        }

        if (string.Equals(
                snapshot.ProviderStatus,
                "PAID",
                StringComparison.OrdinalIgnoreCase
            ) &&
            snapshot.PaymentMethod ==
                PaymentMethod.Unknown)
        {
            throw new InvalidOperationException(
                "Paid payment method is unsupported."
            );
        }

        unitOfWork.ClearTracking();

        await using var transaction =
            await unitOfWork.BeginTransactionAsync(
                cancellationToken
            );

        var currentPayment =
            await paymentRepository.GetByIdAsync(
                paymentId,
                cancellationToken
            )
            ?? throw new KeyNotFoundException(
                "Local payment was not found."
            );

        if (string.IsNullOrWhiteSpace(
                currentPayment.ExternalCheckoutId
            ) ||
            currentPayment.Amount !=
                snapshot.Amount ||
            (currentPayment.ExternalPaymentId is not null &&
             !string.Equals(
                 currentPayment.ExternalPaymentId,
                 snapshot.Id,
                 StringComparison.Ordinal
             )))
        {
            throw new InvalidOperationException(
                "Payment correlation is incompatible."
            );
        }

        var changed =
            await synchronizer.HandleAsync(
                paymentId,
                snapshot.Id,
                snapshot.Amount,
                snapshot.Currency,
                snapshot.PaymentMethod,
                snapshot.PaymentStatus,
                cancellationToken,
                refundedAmount:
                    snapshot.RefundedAmountInCents /
                    100m
            );

        await transaction.CommitAsync(
            cancellationToken
        );

        return new ProcessPaymentWebhookResult(
            changed
        );
    }

    private static bool TrySelectCharge(
        Payment payment,
        IReadOnlyCollection<PaymentWebhookCharge> charges,
        out PaymentWebhookCharge? selected)
    {
        selected =
            null;

        if (!TryGetAmountInCents(
                payment.Amount,
                out var expectedAmount
            ))
        {
            return false;
        }

        if (payment.ExternalPaymentId is not null)
        {
            var identified =
                charges
                    .Where(charge =>
                        string.Equals(
                            charge.Id?.Trim(),
                            payment.ExternalPaymentId,
                            StringComparison.Ordinal
                        )
                    )
                    .ToArray();

            if (identified.Length != 1 ||
                !IsValidCandidate(
                    identified[0],
                    payment.Id,
                    expectedAmount
                ))
            {
                return false;
            }

            selected =
                identified[0];

            return true;
        }

        var candidates =
            charges
                .Where(charge =>
                    IsValidCandidate(
                        charge,
                        payment.Id,
                        expectedAmount
                    )
                )
                .ToArray();

        if (candidates.Length == 0)
        {
            return false;
        }

        var paid =
            candidates
                .Where(charge =>
                    HasStatus(
                        charge,
                        "PAID"
                    )
                )
                .ToArray();

        if (paid.Length > 0)
        {
            return TrySelectOnly(
                paid,
                out selected
            );
        }

        var pending =
            candidates
                .Where(charge =>
                    HasStatus(
                        charge,
                        "AUTHORIZED"
                    ) ||
                    HasStatus(
                        charge,
                        "IN_ANALYSIS"
                    ) ||
                    HasStatus(
                        charge,
                        "WAITING"
                    )
                )
                .ToArray();

        if (pending.Length > 0)
        {
            return TrySelectOnly(
                pending,
                out selected
            );
        }

        var terminal =
            candidates
                .Where(charge =>
                    HasStatus(
                        charge,
                        "DECLINED"
                    ) ||
                    HasStatus(
                        charge,
                        "CANCELED"
                    )
                )
                .ToArray();

        return TrySelectOnly(
            terminal,
            out selected
        );
    }

    private static bool IsValidCandidate(
        PaymentWebhookCharge charge,
        int paymentId,
        int expectedAmount)
    {
        if (string.IsNullOrWhiteSpace(
                charge.Id
            ) ||
            !charge.Id
                .Trim()
                .StartsWith(
                    "CHAR_",
                    StringComparison.Ordinal
                ) ||
            !string.Equals(
                charge.ReferenceId?.Trim(),
                CreateReference(
                    paymentId
                ),
                StringComparison.Ordinal
            ) ||
            charge.AmountInCents !=
                expectedAmount ||
            !string.Equals(
                charge.Currency?.Trim(),
                "BRL",
                StringComparison.Ordinal
            ) ||
            string.IsNullOrWhiteSpace(
                charge.Status
            ))
        {
            return false;
        }

        var method =
            MapPaymentMethod(
                charge.PaymentMethodType,
                charge.CardProduct
            );

        return !HasStatus(
                   charge,
                   "PAID"
               ) ||
               method != PaymentMethod.Unknown;
    }

    private static PaymentMethod MapPaymentMethod(
        string? type,
        string? cardProduct)
    {
        var normalizedType =
            type?
                .Trim()
                .ToUpperInvariant();

        var normalizedProduct =
            cardProduct?
                .Trim()
                .ToUpperInvariant();

        return normalizedType switch
        {
            "PIX" =>
                PaymentMethod.Pix,

            "CREDIT_CARD" =>
                PaymentMethod.CreditCard,

            "DEBIT_CARD" =>
                PaymentMethod.DebitCard,

            "CARD" when normalizedProduct ==
                "CREDIT" =>
                    PaymentMethod.CreditCard,

            "CARD" when normalizedProduct ==
                "DEBIT" =>
                    PaymentMethod.DebitCard,

            _ =>
                PaymentMethod.Unknown
        };
    }

    private static bool TrySelectOnly(
        IReadOnlyCollection<PaymentWebhookCharge> candidates,
        out PaymentWebhookCharge? selected)
    {
        selected =
            candidates.Count == 1
                ? candidates.Single()
                : null;

        return selected is not null;
    }

    private static bool HasStatus(
        PaymentWebhookCharge charge,
        string status)
    {
        return string.Equals(
            charge.Status?.Trim(),
            status,
            StringComparison.OrdinalIgnoreCase
        );
    }

    private static bool TryGetAmountInCents(
        decimal amount,
        out int cents)
    {
        var value =
            amount * 100m;

        if (value <= 0 ||
            value != decimal.Truncate(
                value
            ) ||
            value > int.MaxValue)
        {
            cents =
                0;

            return false;
        }

        cents =
            checked((int)value);

        return true;
    }

    private static bool TryGetPaymentId(
        string? reference,
        out int paymentId)
    {
        paymentId =
            0;

        const string prefix =
            "payment:";

        return reference is not null &&
               reference.StartsWith(
                   prefix,
                   StringComparison.Ordinal
               ) &&
               int.TryParse(
                   reference[prefix.Length..],
                   NumberStyles.None,
                   CultureInfo.InvariantCulture,
                   out paymentId
               ) &&
               paymentId > 0;
    }

    private static string CreateReference(
        int paymentId)
    {
        return $"payment:{paymentId}";
    }
}