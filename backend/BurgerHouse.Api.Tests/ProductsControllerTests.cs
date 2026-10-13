using System.Net;
using System.Net.Http.Json;
using BurgerHouse.Api.Controllers;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BurgerHouse.Api.Tests;

public sealed class ProductsControllerTests
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> factory;

    public ProductsControllerTests(
        WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PublicCatalogReturnsProductsWithoutAdminAuthentication()
    {
        using var client =
            factory.CreateClient(
                new WebApplicationFactoryClientOptions
                {
                    AllowAutoRedirect = false
                }
            );

        var response =
            await client.GetAsync(
                "/api/products"
            );

        Assert.Equal(
            HttpStatusCode.OK,
            response.StatusCode
        );

        var products =
            await response.Content
                .ReadFromJsonAsync<
                    List<PublicProductResponse>
                >();

        Assert.NotNull(
            products
        );

        Assert.NotEmpty(
            products
        );

        var crown =
            Assert.Single(
                products,
                product =>
                    product.Code ==
                    "burger-joia-da-coroa"
            );

        Assert.Equal(
            58.90m,
            crown.Price
        );

        Assert.True(
            crown.IsActive
        );

        var praiano = Assert.Single(
            products,
            product => product.Code == "burger-praiano"
        );

        Assert.Equal("O Praiano", praiano.Name);

        Assert.Equal(
            "Queijo coalho grelhado com fio de mel, banana-da-terra frita, bacon crocante e maionese defumada.",
            praiano.Description
        );
    }

    [Fact]
    public async Task PublicCatalogDoesNotExposeAdministrativeFields()
    {
        using var client =
            factory.CreateClient();

        var json =
            await client.GetStringAsync(
                "/api/products"
            );

        Assert.DoesNotContain(
            "costPrice",
            json,
            StringComparison.OrdinalIgnoreCase
        );

        Assert.DoesNotContain(
            "admin",
            json,
            StringComparison.OrdinalIgnoreCase
        );
    }
}