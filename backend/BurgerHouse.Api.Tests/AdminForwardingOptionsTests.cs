using System.Net;
using BurgerHouse.Api.Admin;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace BurgerHouse.Api.Tests;

public sealed class AdminForwardingOptionsTests
{
    [Fact]
    public void AppServiceNetworkTrustRequiresExplicitOptIn()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["WEBSITE_INSTANCE_ID"] = "test-instance", ["WEBSITE_SITE_NAME"] = "test-site"
        }).Build();
        services.AddOwnerAdministration(configuration, false);
        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;
        Assert.DoesNotContain(options.KnownNetworks, network => network.Contains(IPAddress.Parse("10.12.3.4")));
    }

    [Fact]
    public void AppServiceNetworkTrustCannotBeEnabledOutsideAppService()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Admin:ForwardedHeaders:UseAzureAppServiceNetworks"] = "true",
            ["WEBSITE_INSTANCE_ID"] = null, ["WEBSITE_SITE_NAME"] = null
        }).Build();
        services.AddOwnerAdministration(configuration, false);
        using var provider = services.BuildServiceProvider();
        Assert.Throws<InvalidOperationException>(() => provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value);
    }

    [Fact]
    public void RestrictedHostTrustSurvivesAdminConfiguration()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var proxy = IPAddress.Parse("198.18.1.5");
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.KnownProxies.Add(proxy);
            options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(IPAddress.Parse("198.18.0.0"), 24));
        });
        services.AddOwnerAdministration(new ConfigurationBuilder().Build(), false);
        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;
        Assert.Contains(proxy, options.KnownProxies);
        Assert.Contains(options.KnownNetworks, network => network.Contains(IPAddress.Parse("198.18.0.5")));
        Assert.DoesNotContain(options.KnownNetworks, network => network.Contains(IPAddress.Parse("203.0.113.1")));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void HostCannotSupplyUnrestrictedTrust(bool network)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            if (network) options.KnownNetworks.Add(new Microsoft.AspNetCore.HttpOverrides.IPNetwork(IPAddress.Any, 0));
            else options.KnownProxies.Add(IPAddress.Any);
        });
        services.AddOwnerAdministration(new ConfigurationBuilder().Build(), false);
        using var provider = services.BuildServiceProvider();
        Assert.Throws<OptionsValidationException>(() => provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value);
    }

    [Fact]
    public void HostDefaultsCannotEnableTrustAllOrUnlimitedForwarding()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.KnownProxies.Clear(); options.KnownNetworks.Clear();
            options.ForwardLimit = null;
            options.ForwardedHeaders = ForwardedHeaders.All;
        });
        services.AddOwnerAdministration(new ConfigurationBuilder().Build(), false);
        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;
        Assert.Equal(1, options.ForwardLimit);
        Assert.Equal(ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto, options.ForwardedHeaders);
        Assert.Contains(IPAddress.IPv6Loopback, options.KnownProxies);
        Assert.Contains(options.KnownNetworks, network => network.Contains(IPAddress.Loopback));
        Assert.DoesNotContain(options.KnownNetworks, network => network.Contains(IPAddress.Parse("203.0.113.1")));
    }

    [Theory]
    [InlineData("KnownProxies:0", "0.0.0.0")]
    [InlineData("KnownProxies:0", "not-an-ip")]
    [InlineData("KnownNetworks:0", "0.0.0.0/0")]
    [InlineData("KnownNetworks:0", "::/0")]
    [InlineData("ForwardLimit", "0")]
    [InlineData("ForwardLimit", "6")]
    public void UnsafeForwardingConfigurationFailsValidation(string setting, string value)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["Admin:ForwardedHeaders:" + setting] = value }).Build();
        services.AddOwnerAdministration(configuration, false);
        using var provider = services.BuildServiceProvider();
        Action resolve = () => _ = provider.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;
        if (setting == "ForwardLimit") Assert.Throws<OptionsValidationException>(resolve);
        else Assert.Throws<InvalidOperationException>(resolve);
    }
}
