using BurgerHouse.Infrastructure.Payments.PagBank;

namespace BurgerHouse.Api;

public sealed class PendingPaymentExpirationWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<PendingPaymentExpirationWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Delay first so application startup is not blocked by cleanup work.
                await Task.Delay(
                    TimeSpan.FromMinutes(1),
                    stoppingToken
                );

                await using var scope =
                    scopeFactory.CreateAsyncScope();

                var expired =
                    await scope.ServiceProvider
                        .GetRequiredService<PendingPaymentExpirationBatch>()
                        .RunAsync(stoppingToken);

                if (expired > 0)
                {
                    logger.LogInformation(
                        "Pending payment expiration completed. ExpiredOrders: {ExpiredOrders}.",
                        expired
                    );
                }
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    "Pending payment expiration failed. Failure: {Failure}.",
                    exception.GetType().Name
                );
            }
        }
    }
}