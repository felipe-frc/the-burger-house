using System.Net.Http.Json;
using System.Text.Json;
using BurgerHouse.Application.Translations;
using Microsoft.Extensions.Configuration;

namespace BurgerHouse.Infrastructure.Translations;

public sealed class AzureProductTranslationService(
    HttpClient httpClient,
    IConfiguration configuration)
    : IProductTranslationService
{
    private const string Endpoint =
        "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=pt&to=en";

    public async Task<ProductTranslation> TranslateAsync(
        string name,
        string description,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException(
                "Product name is required.",
                nameof(name));

        if (string.IsNullOrWhiteSpace(description))
            throw new ArgumentException(
                "Product description is required.",
                nameof(description));

        var key = configuration["AzureTranslator:Key"];

        if (string.IsNullOrWhiteSpace(key))
            throw new InvalidOperationException(
                "Azure Translator key is not configured.");

        if (key.Any(char.IsControl))
            throw new InvalidOperationException(
                "Azure Translator key contains invalid characters.");

        var payload = new[]
        {
            new { Text = name },
            new { Text = description }
        };

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            Endpoint);

        request.Headers.Add(
            "Ocp-Apim-Subscription-Key",
            key);

        request.Content = JsonContent.Create(payload);

        using var response = await httpClient.SendAsync(
            request,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"Azure Translator request failed. HTTP {(int)response.StatusCode}.",
                null,
                response.StatusCode);
        }

        using var json = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(
                cancellationToken),
            cancellationToken: cancellationToken);

        var root = json.RootElement;

        if (
            root.ValueKind != JsonValueKind.Array ||
            root.GetArrayLength() != 2
        )
        {
            throw new InvalidOperationException(
                "Azure Translator returned an unexpected response.");
        }

        static string ReadTranslation(JsonElement item)
        {
            var translations = item.GetProperty("translations");

            if (
                translations.ValueKind != JsonValueKind.Array ||
                translations.GetArrayLength() == 0
            )
            {
                throw new InvalidOperationException(
                    "Azure Translator returned an empty translation.");
            }

            return translations[0]
                .GetProperty("text")
                .GetString()
                ?.Trim() ?? "";
        }

        var result = new ProductTranslation(
            ReadTranslation(root[0]),
            ReadTranslation(root[1]));

        if (!ProductTranslationValidator.IsValid(
                name,
                description,
                result))
        {
            throw new InvalidOperationException(
                "Azure translation failed product validation.");
        }

        return result;
    }
}