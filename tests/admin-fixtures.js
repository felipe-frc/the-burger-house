export const summary = {
  revenue: 120,
  paidOrders: 2,
  averageTicket: 60,
  grossProfit: 40,
  ordersWithCost: 1,
  partialRefunds: 0,
};
export const order = {
  id: 108,
  createdAt: "2026-10-05T21:00:00Z",
  customerName: "Cliente Teste",
  orderType: "delivery",
  itemCount: 2,
  total: 60,
  status: "Received",
  paymentMethod: "Pix",
  paymentStatus: "Approved",
};
export const dashboard = {
  today: summary,
  week: summary,
  month: summary,
  last30Days: summary,
  openOrders: 2,
  newPaidOrders: 1,
  recentOrders: [order],
};
export const detail = {
  order,
  customerPhone: "11999990000",
  zipCode: "38400-000",
  street: "Rua Teste",
  houseNumber: "10",
  neighborhood: "Centro",
  city: "Cidade",
  complement: "Casa",
  observation: "Sem cebola",
  deliveryFee: 5,
  items: [
    { name: "O Praiano", quantity: 2, unitPrice: 27.5, subtotal: 55, observation: "Sem sal" },
  ],
  payments: [{ method: "Pix", status: "Approved", amount: 60, updatedAt: "2026-10-05T21:00:00Z" }],
};
export const products = [
  { id: 1, name: "O Praiano", price: 30, costPrice: 10, margin: 20, isActive: true },
];
export const points = [
  { date: "2026-10-04", revenue: 0 },
  { date: "2026-10-05", revenue: 120 },
];
export function mockData(path) {
  if (path.startsWith("notifications"))
    return { until: "2026-10-05T22:00:00Z", nextAfterId: null, newPaidOrders: 1, items: [] };
  if (path === "dashboard") return structuredClone(dashboard);
  if (path.startsWith("orders?"))
    return {
      items: [structuredClone(order)],
      total: 21,
      pageNumber: Number(new URLSearchParams(path.split("?")[1]).get("page") || 1),
      pageSize: 20,
    };
  if (path === "orders/108") return structuredClone(detail);
  if (path === "products") return structuredClone(products);
  if (path === "store") return { deliveryFee: 5 };
  if (path.startsWith("finance/summary")) return structuredClone(summary);
  if (path.startsWith("finance/revenue")) return structuredClone(points);
  if (path.startsWith("finance/payment-methods"))
    return [{ method: "Pix", count: 2, revenue: 120, percentage: 100 }];
  if (path.startsWith("finance/transactions"))
    return {
      items: [
        {
          orderId: 108,
          customerName: "Cliente Teste",
          date: "2026-10-05T21:00:00Z",
          method: "Pix",
          amount: 60,
          status: "Approved",
        },
      ],
      pageNumber: 1,
      pageSize: 20,
      total: 1,
    };
  return null;
}
