using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Application.Orders.CreateOrder;

public class CreateOrderHandler
{
    private readonly IProductRepository _productRepository;
    private readonly IOrderRepository _orderRepository;

    public CreateOrderHandler(
        IProductRepository productRepository,
        IOrderRepository orderRepository)
    {
        _productRepository = productRepository;
        _orderRepository = orderRepository;
    }

    public async Task<CreateOrderResponse> HandleAsync(
        CreateOrderRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.Items is null || request.Items.Count == 0)
            throw new ArgumentException(
                "The order must contain at least one item."
            );

        var order = new Order(deliveryFee: 0m);

        foreach (var requestedItem in request.Items)
        {
            var product = await _productRepository.GetByCodeAsync(
                requestedItem.ProductCode,
                cancellationToken
            );

            if (product is null)
                throw new KeyNotFoundException(
                    $"Product '{requestedItem.ProductCode}' was not found."
                );

            var orderItem = new OrderItem(
                product.Id,
                requestedItem.Quantity,
                product.Price,
                requestedItem.Observation
            );

            order.AddItem(orderItem);
        }

        await _orderRepository.AddAsync(order, cancellationToken);
        await _orderRepository.SaveChangesAsync(cancellationToken);

        return new CreateOrderResponse
        {
            OrderId = order.Id,
            Subtotal = order.Subtotal,
            DeliveryFee = order.DeliveryFee,
            Total = order.Total
        };
    }
}