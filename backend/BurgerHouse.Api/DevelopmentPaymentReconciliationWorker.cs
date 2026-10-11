using BurgerHouse.Infrastructure.Payments.PagBank;

namespace BurgerHouse.Api;

public sealed class DevelopmentPaymentReconciliationWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<DevelopmentPaymentReconciliationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var cursor = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Delay after each batch: no overlapping runs or catch-up bursts.
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                await using var scope = scopeFactory.CreateAsyncScope();
                cursor = await scope.ServiceProvider.GetRequiredService<PendingPaymentReconciliationBatch>()
                    .RunAsync(cursor, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                // Exception messages may contain provider responses or personal data.
                logger.LogWarning("Development pending payment reconciliation failed. Failure: {Failure}.",
                    exception.GetType().Name);
            }
        }
    }
}
