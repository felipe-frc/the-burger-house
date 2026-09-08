using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

using Microsoft.Extensions.Options;

namespace BurgerHouse.Infrastructure.Payments.MercadoPago;

public sealed class MercadoPagoOrderLookup
{
    private readonly HttpClient _httpClient;
    private readonly string _accessToken;

    public MercadoPagoOrderLookup(
        HttpClient httpClient,
        IOptions<MercadoPagoOptions> options)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);

        if (string.IsNullOrWhiteSpace(options.Value.AccessToken))
        {
            throw new InvalidOperationException(
                "Mercado Pago access token was not configured."
            );
        }

        _httpClient = httpClient;
        _accessToken = options.Value.AccessToken;
    }

    public async Task<MercadoPagoOrderSnapshot?> GetAsync(
        string externalOrderId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(externalOrderId))
        {
            throw new ArgumentException(
                "External order id is required.",
                nameof(externalOrderId)
            );
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://api.mercadopago.com/v1/orders/{Uri.EscapeDataString(externalOrderId)}"
        );

        request.Headers.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                _accessToken
            );

        using var response = await _httpClient.SendAsync(
            request,
            cancellationToken
        );

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"Mercado Pago order lookup failed with HTTP {(int)response.StatusCode}."
            );
        }

        await using var stream =
            await response.Content.ReadAsStreamAsync(cancellationToken);

        using var document =
            await JsonDocument.ParseAsync(
                stream,
                cancellationToken: cancellationToken
            );

        var root = document.RootElement;

        var id =
            root.TryGetProperty("id", out var idElement)
                ? idElement.GetString()
                : null;

        var status =
            root.TryGetProperty("status", out var statusElement)
                ? statusElement.GetString()
                : null;

        if (string.IsNullOrWhiteSpace(id))
        {
            throw new InvalidOperationException(
                "Mercado Pago returned an order without an id."
            );
        }

        return new MercadoPagoOrderSnapshot(
            id,
            status
        );
    }
}

public sealed record MercadoPagoOrderSnapshot(
    string Id,
    string? Status
);