namespace BurgerHouse.Application.Payments.ProcessPaymentWebhook;

public sealed record ProcessPaymentWebhookCommand(
    string? ExternalOrderId,
    string? ReferenceId,
    IReadOnlyCollection<PaymentWebhookCharge> Charges
);

public sealed record PaymentWebhookCharge(
    string? Id,
    string? ReferenceId,
    string? Status,
    int? AmountInCents,
    string? Currency,
    int? TotalAmountInCents,
    int? RefundedAmountInCents,
    string? PaymentMethodType,
    string? CardProduct
);

public sealed record ProcessPaymentWebhookResult(
    bool Synchronized
);

public sealed class PaymentProviderVerificationException(
    string message,
    Exception? innerException = null)
    : Exception(
        message,
        innerException
    );