using System.Net;
using BurgerHouse.Api;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using BurgerHouse.Api.Controllers;
using Microsoft.AspNetCore.Mvc;

namespace BurgerHouse.Api.Tests;

public sealed class PortfolioSandboxTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "burgerhouse-homologation-" + Guid.NewGuid().ToString("N"));
    private Dictionary<string, string?> Settings() => new() {
        ["Homologation:Root"] = root, ["Portfolio:Enabled"] = "true",
        ["Database:Provider"] = "PostgreSQL",
        ["ConnectionStrings:DefaultConnection"] = "Host=127.0.0.1;Port=55482;Database=tbh_portfolio_dev;Username=tbh_portfolio_dev_role;Search Path=public",
        ["ASPNETCORE_URLS"] = "http://127.0.0.1:55484",
        ["PagBank:BaseUrl"] = "https://sandbox.api.pagseguro.com",
        ["PagBank:RedirectUrl"] = "https://127.0.0.1:55485/menu",
        ["PagBank:EnablePortfolioSandbox"] = "true", ["PagBank:Token"] = "synthetic-test-only"
    };
    private static IConfiguration Config(Dictionary<string, string?> values) => new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    [Theory]
    [InlineData("Portfolio:Enabled", "false")]
    [InlineData("PagBank:BaseUrl", "https://api.pagseguro.com")]
    [InlineData("PagBank:RedirectUrl", "https://localhost:4174/menu")]
    [InlineData("PagBank:NotificationUrl", "https://example.invalid/hook")]
    [InlineData("PagBank:AllowUnsignedSandboxWebhooks", "true")]
    [InlineData("ASPNETCORE_URLS", "http://0.0.0.0:55484")]
    [InlineData("Database:Provider", "SQLite")]
    [InlineData("ConnectionStrings:DefaultConnection", "Host=127.0.0.1;Port=5432;Database=tbh_portfolio_dev;Username=tbh_portfolio_dev_role;Search Path=public")]
    [InlineData("ConnectionStrings:DefaultConnection", "Host=remote.invalid;Port=55482;Database=tbh_portfolio_dev;Username=tbh_portfolio_dev_role;Search Path=public")]
    public async Task RefusesUnsafeCombinationBeforeProviderCall(string key, string value)
    {
        var values = Settings(); values[key] = value;
        var handler = new Probe(HttpStatusCode.NotFound);
        using var client = new HttpClient(handler);
        await Assert.ThrowsAnyAsync<Exception>(() => PortfolioSandbox.ValidateAsync(Config(values), new EnvironmentStub(), client));
        Assert.Equal(0, handler.Calls);
    }

    [Theory]
    [InlineData(404, true)] [InlineData(401, false)] [InlineData(403, false)]
    [InlineData(200, false)] [InlineData(302, false)] [InlineData(500, false)]
    public async Task RequiresAuthenticatedSandboxProbe(int status, bool accepted)
    {
        var handler = new Probe((HttpStatusCode)status);
        using var client = new HttpClient(handler);
        if (accepted) Assert.True(await PortfolioSandbox.ValidateAsync(Config(Settings()), new EnvironmentStub(), client));
        else await Assert.ThrowsAsync<InvalidOperationException>(() => PortfolioSandbox.ValidateAsync(Config(Settings()), new EnvironmentStub(), client));
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task OfflineDoesNotContactProviderAndProductionRejectsPortfolio()
    {
        var values = Settings(); values["PagBank:EnablePortfolioSandbox"] = "false";
        var handler = new Probe(HttpStatusCode.NotFound);
        using var client = new HttpClient(handler);
        Assert.False(await PortfolioSandbox.ValidateAsync(Config(values), new EnvironmentStub(), client));
        await Assert.ThrowsAsync<InvalidOperationException>(() => PortfolioSandbox.ValidateAsync(Config(values), new EnvironmentStub { EnvironmentName = "Production" }, client));
        Assert.Equal(0, handler.Calls);
    }
    [Fact]
    public async Task OfflineCheckoutRejectsBeforeCreatingPayment()
    {
        var values = Settings(); values["PagBank:EnablePortfolioSandbox"] = "false";
        var controller = new CheckoutController(null!, configuration: Config(values));
        var result = Assert.IsType<ObjectResult>(await controller.CreateCheckoutAsync(1, default));
        Assert.Equal(503, result.StatusCode);
    }
    public void Dispose() { if (Directory.Exists(root)) Directory.Delete(root, true); }
    private sealed class Probe(HttpStatusCode status) : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.Equal("sandbox.api.pagseguro.com", request.RequestUri!.Host);
            Assert.StartsWith("/checkouts/CHEC_", request.RequestUri.AbsolutePath);
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            return Task.FromResult(new HttpResponseMessage(status));
        }
    }
    private sealed class EnvironmentStub : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Homologation";
        public string ApplicationName { get; set; } = "SyntheticTest";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
