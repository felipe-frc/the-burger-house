using BurgerHouse.Application.Admin;

namespace BurgerHouse.Api.Admin;

internal sealed class DeliveryTrackingRetention(IServiceScopeFactory scopes, TimeProvider clock, ILogger<DeliveryTrackingRetention> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1), clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<IDeliveryTrackingService>().PurgeAsync(clock.GetUtcNow().UtcDateTime, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception) { logger.LogWarning("Não foi possível expirar posições de entrega nesta tentativa."); }
        }
    }
}
