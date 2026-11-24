using BurgerHouse.Api;
using Microsoft.Extensions.Configuration;

namespace BurgerHouse.Api.Tests;

public sealed class HomologationSafetyTests
{
    [Theory]
    [InlineData("production-database")]
    [InlineData("live-provider")]
    [InlineData("production-webhook")]
    [InlineData("create-database")]
    [InlineData("missing-root")]
    [InlineData("unsigned-webhook")]
    [InlineData("local")]
    [InlineData("local-with-webhook")]
    [InlineData("wrong-local-return")]
    [InlineData("public-without-webhook")]
    [InlineData("valid")]
    public void RejectsUnsafeConfigurationsBeforeStartup(string scenario)
    {
        var root = Path.Combine(Path.GetTempPath(), "burgerhouse-homologation-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var db = Path.Combine(root, "burgerhouse.homologation.db"); File.WriteAllText(db, "fixture");
        try
        {
            var values = new Dictionary<string, string?> {
                ["Homologation:Root"] = root,
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={db};Mode=ReadWrite",
                ["PagBank:BaseUrl"] = "https://sandbox.api.pagseguro.com",
                ["PagBank:RedirectUrl"] = "https://acceptance.example.invalid/menu",
                ["PagBank:NotificationUrl"] = "https://acceptance.example.invalid/api/webhooks/pagbank"
            };
            switch (scenario)
            {
                case "production-database": values["ConnectionStrings:DefaultConnection"] = "Data Source=/home/burgerhouse.db;Mode=ReadWrite"; break;
                case "live-provider": values["PagBank:BaseUrl"] = "https://api.pagseguro.com"; break;
                case "production-webhook": values["PagBank:NotificationUrl"] = "https://the-burger-house-api-gqfkakgnfvfxd0g0.brazilsouth-01.azurewebsites.net/api/webhooks/pagbank"; break;
                case "create-database": values["ConnectionStrings:DefaultConnection"] = $"Data Source={db};Mode=ReadWriteCreate"; break;
                case "missing-root": values["Homologation:Root"] = null; break;
                case "unsigned-webhook": values["PagBank:AllowUnsignedSandboxWebhooks"] = "true"; break;
                case "local":
                    values["PagBank:RedirectUrl"] = "https://localhost:4174/menu";
                    values["PagBank:NotificationUrl"] = null;
                    break;
                case "local-with-webhook": values["PagBank:RedirectUrl"] = "https://localhost:4174/menu"; break;
                case "wrong-local-return":
                    values["PagBank:RedirectUrl"] = "https://localhost:4175/menu";
                    values["PagBank:NotificationUrl"] = null;
                    break;
                case "public-without-webhook": values["PagBank:NotificationUrl"] = null; break;
            }
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
            if (scenario is "valid" or "local") HomologationSafety.Validate(configuration);
            else Assert.Throws<InvalidOperationException>(() => HomologationSafety.Validate(configuration));
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}
