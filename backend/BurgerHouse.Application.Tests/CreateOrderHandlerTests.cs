using System.Reflection;

using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Application.Tests;

public class CreateOrderHandlerTests
{
    [Fact]
    public async Task HandleAsync_ShouldCreatePickupOrderUsingOfficialProductPrice()
    {
        var product = CreateProduct(
            id: 1,
            code: "burger-praiano",
            name: "O Praiano",
            price: 43.90m
        );

        var productRepository =
            new FakeProductRepository(product);

        var orderRepository =
            new FakeOrderRepository();

        var handler = new CreateOrderHandler(
            productRepository,
            orderRepository
        );

        var request = new CreateOrderRequest
        {
            OrderType = OrderTypes.Pickup, CustomerName = " Cliente Teste ", CustomerPhone = " 11999990000 ", Observation = " Sem cebola ",

            Items =
            [
                new CreateOrderItemRequest
                {
                    ProductCode = "burger-praiano",
                    Quantity = 2,
                    Observation = "Sem bacon"
                }
            ]
        };

        var response =
            await handler.HandleAsync(request);

        Assert.Equal(100, response.OrderId);
        Assert.Equal(87.80m, response.Subtotal);
        Assert.Equal(0m, response.DeliveryFee);
        Assert.Equal(87.80m, response.Total);
        Assert.Equal("pickup", orderRepository.AddedOrder!.OrderType);
        Assert.Equal("Cliente Teste", orderRepository.AddedOrder.CustomerName);
        Assert.Equal("11999990000", orderRepository.AddedOrder.CustomerPhone);
        Assert.Equal("Sem cebola", orderRepository.AddedOrder.Observation);
        Assert.Null(orderRepository.AddedOrder.Street);

        Assert.NotNull(
            orderRepository.AddedOrder
        );

        Assert.Single(
            orderRepository.AddedOrder.Items
        );

        var item =
            orderRepository.AddedOrder.Items.Single();

        Assert.Equal(1, item.ProductId);
        Assert.Equal(2, item.Quantity);
        Assert.Equal(43.90m, item.UnitPrice);

        Assert.Equal(
            "Sem bacon",
            item.Observation
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldApplyDeliveryFee_WhenOrderIsDelivery()
    {
        var product = CreateProduct(
            id: 1,
            code: "burger-praiano",
            name: "O Praiano",
            price: 43.90m
        );

        var productRepository =
            new FakeProductRepository(product);

        var orderRepository =
            new FakeOrderRepository();

        var handler = new CreateOrderHandler(
            productRepository,
            orderRepository
        );

        var request = new CreateOrderRequest
        {
            OrderType = OrderTypes.Delivery, CustomerName = " Cliente Teste ", CustomerPhone = " 11999990000 ", ZipCode = " 38400-000 ", Street = " Rua Teste ", HouseNumber = " 10 ", Neighborhood = " Centro ", City = " Cidade ", Complement = " Apto ", Observation = " Sem cebola ",

            Items =
            [
                new CreateOrderItemRequest
                {
                    ProductCode = "burger-praiano",
                    Quantity = 1
                }
            ]
        };

        var response =
            await handler.HandleAsync(request);

        Assert.Equal(43.90m, response.Subtotal);
        Assert.Equal(5m, response.DeliveryFee);
        Assert.Equal(48.90m, response.Total);
        var saved = orderRepository.AddedOrder!;
        Assert.Equal("delivery", saved.OrderType);
        Assert.Equal("Cliente Teste", saved.CustomerName);
        Assert.Equal("11999990000", saved.CustomerPhone);
        Assert.Equal("38400-000", saved.ZipCode);
        Assert.Equal("Rua Teste", saved.Street);
        Assert.Equal("10", saved.HouseNumber);
        Assert.Equal("Centro", saved.Neighborhood);
        Assert.Equal("Cidade", saved.City);
        Assert.Equal("Apto", saved.Complement);
        Assert.Equal("Sem cebola", saved.Observation);

        Assert.NotNull(
            orderRepository.AddedOrder
        );

        Assert.Equal(
            5m,
            orderRepository.AddedOrder.DeliveryFee
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenOrderTypeIsInvalid()
    {
        var productRepository =
            new FakeProductRepository();

        var orderRepository =
            new FakeOrderRepository();

        var handler = new CreateOrderHandler(
            productRepository,
            orderRepository
        );

        var request = new CreateOrderRequest
        {
            OrderType = "invalid",

            Items =
            [
                new CreateOrderItemRequest
                {
                    ProductCode = "burger-praiano",
                    Quantity = 1
                }
            ]
        };

        await Assert.ThrowsAsync<ArgumentException>(
            () => handler.HandleAsync(request)
        );

        Assert.Null(
            orderRepository.AddedOrder
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenOrderHasNoItems()
    {
        var productRepository =
            new FakeProductRepository();

        var orderRepository =
            new FakeOrderRepository();

        var handler = new CreateOrderHandler(
            productRepository,
            orderRepository
        );

        var request = new CreateOrderRequest
        {
            OrderType = OrderTypes.Pickup, CustomerName = " Cliente Teste ", CustomerPhone = " 11999990000 ", Observation = " Sem cebola ",
            Items = []
        };

        await Assert.ThrowsAsync<ArgumentException>(
            () => handler.HandleAsync(request)
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenProductDoesNotExist()
    {
        var productRepository =
            new FakeProductRepository();

        var orderRepository =
            new FakeOrderRepository();

        var handler = new CreateOrderHandler(
            productRepository,
            orderRepository
        );

        var request = new CreateOrderRequest
        {
            OrderType = OrderTypes.Pickup, CustomerName = " Cliente Teste ", CustomerPhone = " 11999990000 ", Observation = " Sem cebola ",

            Items =
            [
                new CreateOrderItemRequest
                {
                    ProductCode =
                        "burger-inexistente",

                    Quantity = 1
                }
            ]
        };

        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => handler.HandleAsync(request)
        );

        Assert.Null(
            orderRepository.AddedOrder
        );
    }

    [Fact]
    public async Task HandleAsync_ShouldThrow_WhenQuantityIsInvalid()
    {
        var product = CreateProduct(
            id: 1,
            code: "burger-praiano",
            name: "O Praiano",
            price: 43.90m
        );

        var productRepository =
            new FakeProductRepository(product);

        var orderRepository =
            new FakeOrderRepository();

        var handler = new CreateOrderHandler(
            productRepository,
            orderRepository
        );

        var request = new CreateOrderRequest
        {
            OrderType = OrderTypes.Pickup, CustomerName = " Cliente Teste ", CustomerPhone = " 11999990000 ", Observation = " Sem cebola ",

            Items =
            [
                new CreateOrderItemRequest
                {
                    ProductCode =
                        "burger-praiano",

                    Quantity = 0
                }
            ]
        };

        await Assert.ThrowsAsync<ArgumentException>(
            () => handler.HandleAsync(request)
        );

        Assert.Null(
            orderRepository.AddedOrder
        );
    }


    [Theory]
    [InlineData("delivery")]
    [InlineData("pickup")]
    public async Task RejectsMissingCustomerBeforePersisting(string type)
    {
        var repository = new FakeOrderRepository();
        var handler = new CreateOrderHandler(new FakeProductRepository(), repository);
        var request = new CreateOrderRequest
        {
            OrderType = type,
            Items = [new() { ProductCode = "burger-praiano", Quantity = 1 }]
        };
        await Assert.ThrowsAsync<ArgumentException>(() => handler.HandleAsync(request));
        Assert.Null(repository.AddedOrder);
    }

    [Fact]
    public async Task RejectsDeliveryWithoutAddressBeforePersisting()
    {
        var repository = new FakeOrderRepository();
        var handler = new CreateOrderHandler(new FakeProductRepository(), repository);
        var request = new CreateOrderRequest
        {
            OrderType = "delivery", CustomerName = "Cliente Teste", CustomerPhone = "11999990000",
            Items = [new() { ProductCode = "burger-praiano", Quantity = 1 }]
        };
        await Assert.ThrowsAsync<ArgumentException>(() => handler.HandleAsync(request));
        Assert.Null(repository.AddedOrder);
    }


    private static Product CreateProduct(
        int id,
        string code,
        string name,
        decimal price)
    {
        var product =
            new Product(
                code,
                name,
                price
            );

        SetPrivateProperty(
            product,
            nameof(Product.Id),
            id
        );

        return product;
    }

    private static void SetPrivateProperty<T>(
        T instance,
        string propertyName,
        object value)
    {
        var property =
            typeof(T).GetProperty(
                propertyName,
                BindingFlags.Instance |
                BindingFlags.Public
            );

        property?.SetValue(
            instance,
            value
        );
    }

    private sealed class FakeProductRepository
        : IProductRepository
    {
        private readonly Product? _product;

        public FakeProductRepository(
            Product? product = null)
        {
            _product = product;
        }

        public Task<Product?> GetByCodeAsync(
            string code,
            CancellationToken cancellationToken = default)
        {
            if (_product?.Code == code)
            {
                return Task.FromResult<Product?>(
                    _product
                );
            }

            return Task.FromResult<Product?>(
                null
            );
        }
    }

    private sealed class FakeOrderRepository
        : IOrderRepository
    {
        public Order? AddedOrder { get; private set; }

        public Task AddAsync(
            Order order,
            CancellationToken cancellationToken = default)
        {
            AddedOrder = order;

            return Task.CompletedTask;
        }

        public Task<Order?> GetByIdAsync(
            int id,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(
                AddedOrder?.Id == id
                    ? AddedOrder
                    : null
            );
        }

        public Task SaveChangesAsync(
            CancellationToken cancellationToken = default)
        {
            if (AddedOrder is not null)
            {
                SetPrivateProperty(
                    AddedOrder,
                    nameof(Order.Id),
                    100
                );
            }

            return Task.CompletedTask;
        }
    }
}
