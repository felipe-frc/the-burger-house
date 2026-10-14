using System.Net;
using System.Text;
using BurgerHouse.Infrastructure.Translations;
using Microsoft.Extensions.Configuration;

namespace BurgerHouse.Infrastructure.Tests;

public sealed class AzureProductTranslationServiceTests
{
    [Fact]
    public async Task TranslatesProductNameAndDescription()
    {
        const string responseJson = """
            [
              {
                "translations": [
                  {
                    "text": "Special Burger",
                    "to": "en"
                  }
                ]
              },
              {
                "translations": [
                  {
                    "text": "180 g beef burger with cheese and bacon.",
                    "to": "en"
                  }
                ]
              }
            ]
            """;

        using var http = new HttpClient(
            new FakeHandler(responseJson));

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["AzureTranslator:Key"] = "test-key"
                })
            .Build();

        var service = new AzureProductTranslationService(
            http,
            configuration);

        var result = await service.TranslateAsync(
            "Burger Especial",
            "Hambúrguer de 180 g com queijo e bacon.",
            CancellationToken.None);

        Assert.Equal("Special Burger", result.EnglishName);

        Assert.Equal(
            "180 g beef burger with cheese and bacon.",
            result.EnglishDescription);
    }

    private sealed class FakeHandler(string responseJson)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Assert.Equal(HttpMethod.Post, request.Method);

            Assert.Contains(
                "api.cognitive.microsofttranslator.com",
                request.RequestUri!.Host);

            Assert.True(
                request.Headers.Contains(
                    "Ocp-Apim-Subscription-Key"));

            return Task.FromResult(
                new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(
                        responseJson,
                        Encoding.UTF8,
                        "application/json")
                });
        }
    }
}