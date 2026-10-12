using BurgerHouse.Api.Admin;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace BurgerHouse.Api.Tests;

public sealed class AdminErrorsMiddlewareTests
{
    [Fact]
    public async Task HttpTransportWithSecureAntiforgeryProducesDiagnosable409()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAntiforgery(options => options.Cookie.SecurePolicy = CookieSecurePolicy.Always);
        using var provider = services.BuildServiceProvider();
        var context = Context(provider);
        var logger = new RecordingLogger();
        var middleware = new AdminErrorsMiddleware(http =>
        {
            provider.GetRequiredService<IAntiforgery>().GetAndStoreTokens(http);
            return Task.CompletedTask;
        }, logger);

        await middleware.InvokeAsync(context);

        Assert.Equal(409, context.Response.StatusCode);
        var log = Assert.Single(logger.Messages);
        Assert.Contains("InvalidOperationException", log);
        Assert.Contains("Secure antiforgery requires HTTPS", log);
        Assert.Contains("api/admin/auth/login", log);
        Assert.Null(Assert.Single(logger.Exceptions));
    }

    [Fact]
    public async Task ArbitraryExceptionDetailsAndRequestDataAreNeverLogged()
    {
        using var provider = new ServiceCollection().AddLogging().BuildServiceProvider();
        var context = Context(provider);
        context.Request.QueryString = new QueryString("?password=private-query");
        context.Request.Headers.Cookie = "private-cookie";
        context.Request.Headers.Authorization = "Bearer private-token";
        context.Request.Body = new MemoryStream("private-body"u8.ToArray());
        var logger = new RecordingLogger();
        var middleware = new AdminErrorsMiddleware(_ => throw new InvalidOperationException(
            "private-email@example.invalid private-password enc:v1:private-ciphertext"), logger);

        await middleware.InvokeAsync(context);

        var log = Assert.Single(logger.Messages);
        Assert.Contains("message=Exception message redacted", log);
        Assert.DoesNotContain("private-", log);
        Assert.DoesNotContain("enc:v1", log);
        Assert.Null(Assert.Single(logger.Exceptions));
    }

    private static DefaultHttpContext Context(IServiceProvider provider)
    {
        var context = new DefaultHttpContext { RequestServices = provider };
        context.Request.Scheme = "http";
        context.Request.Path = "/api/admin/auth/login";
        context.Response.Body = new MemoryStream();
        context.SetEndpoint(new RouteEndpoint(_ => Task.CompletedTask,
            RoutePatternFactory.Parse("api/admin/auth/login"), 0, EndpointMetadataCollection.Empty, "Login"));
        return context;
    }

    private sealed class RecordingLogger : ILogger<AdminErrorsMiddleware>
    {
        public List<string> Messages { get; } = [];
        public List<Exception?> Exceptions { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => true;
        public void Log<TState>(LogLevel level, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            Messages.Add(formatter(state, exception));
            Exceptions.Add(exception);
        }
    }
}
