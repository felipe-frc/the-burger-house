using System.Text.Json;
using BurgerHouse.Application.Orders.CreateOrder;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Orders;

public sealed record PricingLine(string ProductCode, decimal UnitPrice, decimal ExtraTotal);
public sealed record OrderQuote(decimal Subtotal, decimal Discount, decimal DeliveryFee, decimal Total,
    string? CouponCode, IReadOnlyList<PricingLine> Lines);

public sealed class OrderPricingService(BurgerHouseDbContext db, TimeProvider clock)
{
    private sealed record PricedItem(Product Product, CreateOrderItemRequest Request,
        decimal UnitPrice, string? Observation, string? ExtrasJson);

    private async Task<List<PricedItem>> PriceItems(List<CreateOrderItemRequest> items, CancellationToken ct)
    {
        if (items == null || items.Count is < 1 or > 99 ||
            items.Any(x => x == null || x.Extras == null || x.Extras.Any(extra => extra == null || string.IsNullOrWhiteSpace(extra.Code))))
            throw new ArgumentException("Confira os itens da sacola.");
        var productCodes = items.Select(x => x.ProductCode).Distinct().ToArray();
        var extraCodes = items.SelectMany(x => x.Extras).Select(x => x.Code).Distinct().ToArray();
        var products = await db.Products.AsNoTracking().Where(x => productCodes.Contains(x.Code)).ToDictionaryAsync(x => x.Code, ct);
        var extras = await db.Set<AddonOption>().AsNoTracking().Where(x => extraCodes.Contains(x.Code)).ToDictionaryAsync(x => x.Code, ct);
        var result = new List<PricedItem>();
        foreach (var item in items)
        {
            if (!products.TryGetValue(item.ProductCode, out var product) || !product.IsActive ||
                item.Quantity is < 1 or > 99 || item.Extras.Count > 10 ||
                item.Extras.Select(x => x.Code).Distinct().Count() != item.Extras.Count)
                throw new ArgumentException("Produto ou quantidade indisponível.");
            decimal extraTotal = 0;
            var snapshots = new List<object>();
            var notes = new List<string>();
            foreach (var choice in item.Extras)
            {
                if (!extras.TryGetValue(choice.Code, out var extra) || !extra.IsActive || extra.Price <= 0 ||
                    extra.ProductCategory != product.Category || choice.Quantity < 1 || choice.Quantity > extra.MaximumQuantity)
                    throw new ArgumentException("Adicional inválido ou incompatível com o produto.");
                extraTotal += extra.Price * choice.Quantity;
                snapshots.Add(new { extra.Code, extra.Name, extra.Price, choice.Quantity });
                notes.Add($"{choice.Quantity}x {extra.Name}");
            }
            var observation = string.Join(" · ", new[] { item.Observation, notes.Count > 0 ? "Adicionais: " + string.Join(", ", notes) : null }
                .Where(x => !string.IsNullOrWhiteSpace(x)));
            result.Add(new(product, item, product.Price + extraTotal, observation,
                snapshots.Count == 0 ? null : JsonSerializer.Serialize(snapshots)));
        }
        return result;
    }

    private async Task<Coupon?> FindCoupon(string? code, decimal subtotal, CancellationToken ct, bool reserved = false)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var normalized = code.Trim().ToUpperInvariant();
        if (normalized.Length > 40) throw new ArgumentException("Cupom inválido.");
        var coupon = await db.Set<Coupon>().AsNoTracking().SingleOrDefaultAsync(x => x.Code == normalized, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        if (coupon == null || !coupon.IsActive || now < coupon.StartsAt || now >= coupon.ExpiresAt ||
            coupon.Percentage < 0 || coupon.Percentage > 100 || coupon.FixedAmount < 0 ||
            (coupon.Percentage > 0) == (coupon.FixedAmount > 0) ||
            subtotal < coupon.MinimumSubtotal || coupon.UsedCount > coupon.UsageLimit ||
            (!reserved && coupon.UsedCount == coupon.UsageLimit))
            throw new ArgumentException("Cupom inválido, expirado, esgotado ou valor mínimo não atingido.");
        return coupon;
    }

    private static OrderQuote Calculate(List<PricedItem> items, Coupon? coupon, string orderType)
    {
        var deliveryFee = orderType switch
        {
            "pickup" => 0m,
            "delivery" => CreateOrderHandler.DeliveryFee,
            _ => throw new ArgumentException("Escolha entrega ou retirada.")
        };
        var subtotal = items.Sum(x => x.UnitPrice * x.Request.Quantity);
        var eligible = items.Where(x => coupon?.ProductCategory == null || x.Product.Category == coupon.ProductCategory)
            .Sum(x => x.UnitPrice * x.Request.Quantity);
        var discount = coupon == null ? 0 : Math.Min(eligible,
            decimal.Round(eligible * coupon.Percentage / 100 + coupon.FixedAmount, 2, MidpointRounding.AwayFromZero));
        if (coupon != null && discount <= 0) throw new ArgumentException("O cupom não se aplica aos produtos selecionados.");
        if (subtotal - discount + deliveryFee <= 0) throw new ArgumentException("O total precisa ser positivo.");
        return new(subtotal, discount, deliveryFee, subtotal - discount + deliveryFee, coupon?.Code,
            items.Select(x => new PricingLine(x.Product.Code, x.UnitPrice, x.UnitPrice - x.Product.Price)).ToList());
    }

    public async Task<OrderQuote> QuoteAsync(CreateOrderRequest request, CancellationToken ct)
    {
        var items = await PriceItems(request.Items, ct);
        var coupon = await FindCoupon(request.CouponCode, items.Sum(x => x.UnitPrice * x.Request.Quantity), ct);
        return Calculate(items, coupon, request.OrderType);
    }

    public async Task<CreateOrderResponse> CreateAsync(CreateOrderRequest request, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var items = await PriceItems(request.Items, ct);
        var coupon = await FindCoupon(request.CouponCode, items.Sum(x => x.UnitPrice * x.Request.Quantity), ct);
        var quote = Calculate(items, coupon, request.OrderType);
        if (coupon != null)
        {
            var now = clock.GetUtcNow().UtcDateTime;
            var consumed = await db.Set<Coupon>().Where(x => x.Code == coupon.Code && x.IsActive &&
                x.StartsAt <= now && x.ExpiresAt > now && x.UsedCount < x.UsageLimit)
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.UsedCount, x => x.UsedCount + 1), ct);
            if (consumed != 1) throw new ArgumentException("O limite de uso do cupom foi atingido.");
        }
        var order = new Order(quote.DeliveryFee, request.OrderType, request.CustomerName, request.CustomerPhone,
            request.CustomerEmail, request.CustomerTaxId, request.ZipCode, request.Street, request.HouseNumber,
            request.Neighborhood, request.City, request.Complement, request.Observation);
        foreach (var item in items)
        {
            var line = new OrderItem(item.Product.Id, item.Request.Quantity, item.UnitPrice, item.Observation,
                item.ExtrasJson == null ? item.Product.CostPrice : null, item.Product.Category);
            if (item.ExtrasJson != null) line.SetExtrasSnapshot(item.ExtrasJson);
            order.AddItem(line);
        }
        if (coupon != null)
        {
            var eligible = order.Items.Where(x => coupon.ProductCategory == null || x.SaleCategory == coupon.ProductCategory).ToList();
            var remaining = quote.Discount;
            var remainingSubtotal = eligible.Sum(x => x.Total);
            foreach (var line in eligible)
            {
                var allocation = Math.Min(line.Total, decimal.Round(
                    remaining * line.Total / remainingSubtotal, 2, MidpointRounding.AwayFromZero));
                line.SetDiscount(allocation);
                remaining -= allocation;
                remainingSubtotal -= line.Total;
            }
            order.ApplyDiscount(coupon.Code, quote.Discount);
        }
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new() { OrderId = order.Id, Subtotal = order.Subtotal, Discount = order.Discount,
            DeliveryFee = order.DeliveryFee, Total = order.Total };
    }

    public async Task ValidateCheckoutAsync(int orderId, CancellationToken ct)
    {
        var order = await db.Orders.AsNoTracking().Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == orderId, ct);
        if (order?.CouponCode != null) await FindCoupon(order.CouponCode, order.Subtotal, ct, reserved: true);
    }
}
