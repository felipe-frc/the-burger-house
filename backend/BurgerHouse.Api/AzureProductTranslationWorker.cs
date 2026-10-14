using BurgerHouse.Infrastructure.Translations;

namespace BurgerHouse.Api;

public sealed class AzureProductTranslationWorker(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<AzureProductTranslationWorker> logger)
    : BackgroundService
{
    private static readonly TimeSpan CheckInterval =
        TimeSpan.FromMinutes(1);

    private static readonly TimeSpan FailureCooldown =
        TimeSpan.FromMinutes(10);

    private readonly Dictionary<int, DateTime> _retryAfter = new();

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        if (!configuration.GetValue<bool>(
                "AZURE_TRANSLATION_ENABLED"))
        {
            logger.LogInformation(
                "Automatic Azure product translations are disabled.");

            return;
        }

        if (string.IsNullOrWhiteSpace(
                configuration["AzureTranslator:Key"]))
        {
            logger.LogWarning(
                "Automatic Azure translations disabled: key missing.");

            return;
        }

        logger.LogInformation(
            "Automatic Azure product translation worker started.");

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await ProcessPendingAsync(stoppingToken);

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }
        catch (OperationCanceledException)
            when (stoppingToken.IsCancellationRequested)
        {
            logger.LogInformation(
                "Automatic Azure product translation worker stopped.");
        }
    }

    private async Task ProcessPendingAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();

            var pending = scope.ServiceProvider
                .GetRequiredService<PendingProductTranslationBatch>();

            var coordinator = scope.ServiceProvider
                .GetRequiredService<ProductTranslationCoordinator>();

            var productIds = await pending.GetPendingProductIdsAsync(
                20,
                cancellationToken);

            var processed = 0;

            foreach (var productId in productIds)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var now = DateTime.UtcNow;

                if (_retryAfter.TryGetValue(
                        productId,
                        out var retryTime) &&
                    now < retryTime)
                {
                    continue;
                }

                // Limita cada ciclo a cinco produtos.
                if (processed >= 5)
                    break;

                processed++;

                var success = await coordinator.TranslateMissingAsync(
                    productId,
                    cancellationToken);

                if (success)
                {
                    _retryAfter.Remove(productId);

                    logger.LogInformation(
                        "Azure translation saved for product {ProductId}.",
                        productId);
                }
                else
                {
                    _retryAfter[productId] =
                        DateTime.UtcNow.Add(FailureCooldown);

                    logger.LogWarning(
                        "Azure translation unavailable for product {ProductId}. Retry scheduled.",
                        productId);
                }

                // Evita enviar varias requisicoes simultaneamente.
                await Task.Delay(
                    TimeSpan.FromSeconds(2),
                    cancellationToken);
            }
        }
        catch (OperationCanceledException)
            when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                "Azure translation cycle failed. Error type: {ErrorType}.",
                exception.GetType().Name);
        }
    }
}