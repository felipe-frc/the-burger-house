using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Application.Orders.CreateOrder;

public class CreateOrderHandler
{
    public const decimal DeliveryFee = 5m;

    private readonly IProductRepository _productRepository;
    private readonly IOrderRepository _orderRepository;

    public CreateOrderHandler(
        IProductRepository productRepository,
        IOrderRepository orderRepository)
    {
        _productRepository =
            productRepository;

        _orderRepository =
            orderRepository;
    }

    public async Task<CreateOrderResponse> HandleAsync(
        CreateOrderRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(
            request
        );

        if (request.Items is null ||
            request.Items.Count == 0)
        {
            throw new ArgumentException(
                "The order must contain at least one item."
            );
        }

        if (request.Items.Count > 99)
        {
            throw new ArgumentException(
                "The order cannot contain more than 99 items."
            );
        }

        var normalizedOrderType =
            (request.OrderType ?? string.Empty)
                .Trim()
                .ToLowerInvariant();

        var deliveryFee =
            normalizedOrderType switch
            {
                OrderTypes.Delivery =>
                    DeliveryFee,

                OrderTypes.Pickup =>
                    0m,

                _ =>
                    throw new ArgumentException(
                        "Order type must be 'delivery' or 'pickup'."
                    )
            };

        var order =
            new Order(
                deliveryFee,
                normalizedOrderType,
                request.CustomerName,
                request.CustomerPhone,
                request.CustomerEmail,
                request.CustomerTaxId,
                request.ZipCode,
                request.Street,
                request.HouseNumber,
                request.Neighborhood,
                request.City,
                request.Complement,
                request.Observation
            );

        var products = (await _productRepository.GetByCodesAsync(
            request.Items.Select(item => item.ProductCode).ToArray(), cancellationToken))
            .ToDictionary(product => product.Code, StringComparer.Ordinal);

        foreach (var requestedItem in request.Items)
        {
            products.TryGetValue(requestedItem.ProductCode?.Trim() ?? string.Empty, out var product);

            if (product is null)
            {
                throw new KeyNotFoundException(
                    $"Product '{requestedItem.ProductCode}' was not found."
                );
            }

            var orderItem =
                new OrderItem(
                    product.Id,
                    requestedItem.Quantity,
                    product.Price,
                    requestedItem.Observation,
                    product.CostPrice,
                    product.Category
                );

            order.AddItem(
                orderItem
            );
        }

        await _orderRepository.AddAsync(
            order,
            cancellationToken
        );

        await _orderRepository.SaveChangesAsync(
            cancellationToken
        );

        return new CreateOrderResponse
        {
            OrderId = order.Id,
            Subtotal = order.Subtotal,
            DeliveryFee = order.DeliveryFee,
            Total = order.Total
        };
    }
}
