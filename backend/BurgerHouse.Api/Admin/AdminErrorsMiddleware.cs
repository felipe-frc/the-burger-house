namespace BurgerHouse.Api.Admin;

public sealed class AdminErrorsMiddleware(RequestDelegate next, ILogger<AdminErrorsMiddleware> logger)
{
    private const string InsecureAntiforgeryRequest = "The antiforgery system has the configuration value AntiforgeryOptions.Cookie.SecurePolicy = Always, but the current request is not an SSL request.";
    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/api/admin")) { await next(context); return; }
        context.Response.Headers.CacheControl = "no-store, private";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        try { await next(context); }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
        catch (Exception exception)
        {
            if (context.Response.HasStarted) throw;
            context.Response.StatusCode = exception switch
            {
                ArgumentException => 400, KeyNotFoundException => 404, InvalidOperationException => 409, _ => 500
            };
            // Only a known framework diagnostic is allowlisted. Never log the exception object.
            var diagnostic = exception is InvalidOperationException && exception.Message == InsecureAntiforgeryRequest
                ? "Secure antiforgery requires HTTPS; verify trusted proxy scheme forwarding."
                : "Exception message redacted; inspect the failing operation in a private environment.";
            var path = context.GetEndpoint() is Microsoft.AspNetCore.Routing.RouteEndpoint endpoint
                ? endpoint.RoutePattern.RawText : "/api/admin/[unmatched]";
            logger.LogError("Admin request failed; exception_type={ExceptionType}; message={TechnicalMessage}; path={RequestPath}",
                exception.GetType().Name, diagnostic, path);
            var message = context.Response.StatusCode switch
            {
                400 => "Dados ou período inválidos.", 404 => "Registro não encontrado.",
                409 => "Operação não permitida ou registro alterado. Atualize a página.",
                _ => "Não foi possível concluir a operação."
            };
            await context.Response.WriteAsJsonAsync(new { error = message });
        }
    }
}
