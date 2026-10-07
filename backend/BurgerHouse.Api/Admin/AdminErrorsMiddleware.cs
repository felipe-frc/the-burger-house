namespace BurgerHouse.Api.Admin;

public sealed class AdminErrorsMiddleware(RequestDelegate next)
{
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
            // Do not serialize/log exceptions that may contain personal data or SQL parameters.
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
