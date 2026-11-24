import { AdminApiError, adminRequest } from './adminHttp';
import type { Order, OrderStatus } from '../types';
import { elapsedMinutes, statusKeys, isActiveStatus, type ServerOrderStatus } from './ownerPresentation';
export interface OrderRowDto {
  id: number; createdAt: string; customerName: string; orderType: string;
  total: number; status: string; paymentMethod: string | null; paymentStatus: string | null; stageStartedAt?: string | null;
}
export interface OrderDetailDto {
  discount?: number;
  order: OrderRowDto; customerPhone: string; street: string | null; houseNumber: string | null;
  neighborhood: string | null; city: string | null; deliveryFee: number;
  stageHistory?: Order['stageHistory'];
  items: { name: string; quantity: number; unitPrice: number; subtotal: number; observation: string | null; category?: string | null }[];
}
export const serverStatus: Record<OrderStatus, ServerOrderStatus> = {
  pending: 'Received', preparing: 'Preparing', ready: 'ReadyForPickup', delivering: 'OutForDelivery', completed: 'Completed', cancelled: 'Cancelled',
};
export function mapOrder(detail: OrderDetailDto): Order {
  const row = detail.order;
  const status = Object.entries(serverStatus).find(([, value]) => value === row.status)?.[0] as OrderStatus | undefined;
  if (!status && row.status !== 'PendingPayment') throw new Error(`Status de pedido não suportado: ${row.status}`);
  return {
    id: String(row.id), code: `#${row.id}`, customerName: row.customerName, customerPhone: detail.customerPhone,
    deliveryType: row.orderType === 'delivery' ? 'DELIVERY' : 'TAKEOUT',
    deliveryAddress: [detail.street, detail.houseNumber, detail.neighborhood, detail.city].filter(Boolean).join(', '),
    items: detail.items.map((item, index) => ({ id: `${row.id}-${index}`, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.subtotal, notes: item.observation ?? undefined, category: item.category ?? undefined })),
    subtotal: detail.items.reduce((sum, item) => sum + item.subtotal, 0), deliveryFee: detail.deliveryFee,
    discount: detail.discount ?? 0, total: row.total, status: status ?? 'pending', serverStatus: row.status as ServerOrderStatus,
    createdAt: row.createdAt, stageStartedAt: row.stageStartedAt ?? undefined, stageHistory: detail.stageHistory,
    elapsedMinutes: elapsedMinutes(row.createdAt, Date.now()),
    estimatedMinutes: 0,
    paymentMethod: ({ Pix: 'PIX', CreditCard: 'CREDIT_CARD', DebitCard: 'DEBIT_CARD' } as const)[row.paymentMethod ?? ''] ?? 'UNKNOWN',
    paymentStatus: ({ Approved: 'PAID', Pending: 'PENDING', Rejected: 'FAILED', Cancelled: 'FAILED', Refunded: 'REFUNDED' } as const)[row.paymentStatus ?? ''] ?? 'UNKNOWN',
  };
}
export async function loadOrderDetail(id: string, signal?: AbortSignal) {
  return mapOrder(await adminRequest<OrderDetailDto>(`/api/admin/orders/${encodeURIComponent(id)}`, { signal }));
}
export interface OrderPageOptions { activeOnly?: boolean; channel?: string; oldestFirst?: boolean }
export async function loadOrderPage(page: number, signal?: AbortSignal, status = '', search = '', options: OrderPageOptions = {}) {
  const query = new URLSearchParams({ Page: String(page), Status: status, Search: search });
  if (options.activeOnly) query.set('ActiveOnly', 'true');
  if (options.channel) query.set('Channel', options.channel);
  if (options.oldestFirst) query.set('Sort', 'oldest');
  const init = { signal };
  try {
    const result = await adminRequest<{ items: OrderDetailDto[]; total: number; pageSize: number }>(
      `/api/admin/orders/operational?${query}`, init);
    return { orders: result.items.map(mapOrder), rows: result.items.map(item => item.order),
      total: result.total, pageSize: result.pageSize };
  } catch (error) {
    // Some deployments still expose only the list and detail routes.
    if (!(error instanceof AdminApiError) || error.status !== 404 || signal?.aborted) throw error;
    const result = await adminRequest<{ items: OrderRowDto[]; total: number; pageSize: number }>(
      `/api/admin/orders?${query}`, init);
    const orders = await Promise.all(result.items.map(row => loadOrderDetail(String(row.id), signal)));
    return { orders, rows: result.items, total: result.total, pageSize: result.pageSize };
  }
}
export async function loadOrderQueues(statuses: string[], signal: AbortSignal, search = '', options: OrderPageOptions = {}) {
  const groups = await Promise.all(statuses.map(async status => {
    const first = await loadOrderPage(1, signal, status, search, options);
    const count = Math.ceil(first.total / first.pageSize);
    if (first.pageSize <= 0 || !Number.isFinite(count) || count > 100) throw new Error('O volume da fila excedeu o limite de consulta.');
    const pages = [first];
    for (let page = 2; page <= count; page++) {
      signal.throwIfAborted();
      pages.push(await loadOrderPage(page, signal, status, search, options));
    }
    return pages;
  }));
  const pages = groups.flat();
  const orders = [...new Map(pages.flatMap(page => page.orders).map(order => [order.id, order])).values()];
  return { orders, rows: pages.flatMap(page => page.rows), total: orders.length, pageSize: Math.max(1, orders.length) };
}
export interface DispatchChecklist { items: boolean; packaging: boolean; identification: boolean }
export async function advanceOrder(id: string, expectedStatus: string, status: OrderStatus, checklist?: DispatchChecklist) {
  await adminRequest(`/api/admin/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', body: JSON.stringify({ expectedStatus, status: serverStatus[status], checklist }),
  });
}

export interface ModuleOrderQuery {
  currentModule: string; queueSupportsFilters: boolean; channel?: string; activeOnly: boolean;
  requestedStatus: string; search: string; orderPage: number;
}

/** Selects the operational projection for each screen; the application shell owns request lifecycle. */
export async function loadModuleOrders(query: ModuleOrderQuery, signal: AbortSignal) {
  const { currentModule, queueSupportsFilters, channel, activeOnly, requestedStatus, search, orderPage } = query;

  if (currentModule === 'kitchen') return loadOrderQueues(['Received', 'Preparing'], signal, '', { oldestFirst: true });
  if (currentModule === 'expedition') return loadOrderQueues(['ReadyForPickup'], signal, '', { oldestFirst: true });
  if (currentModule === 'delivery') {
    const filter = queueSupportsFilters ? { channel: 'delivery' } : {};
    const [open, history] = await Promise.all([
      loadOrderQueues(['ReadyForPickup', 'OutForDelivery'], signal, '', { ...filter, oldestFirst: true }),
      loadOrderPage(1, signal, 'Completed', '', filter),
    ]);
    return { ...open, orders: [...open.orders, ...history.orders], rows: [...open.rows, ...history.rows] };
  }
  if (currentModule === 'overview') {
    const [kitchen, recent] = await Promise.all([
      loadOrderQueues(['Received', 'Preparing'], signal),
      loadOrderPage(1, signal, '', '', queueSupportsFilters ? { activeOnly: true, channel } : {}),
    ]);
    return { ...recent, orders: [...new Map([...recent.orders, ...kitchen.orders].map(order => [order.id, order])).values()],
      rows: [...recent.rows, ...kitchen.rows] };
  }
  if (!queueSupportsFilters && (activeOnly || channel)) {
    const statuses = requestedStatus ? [requestedStatus] : statusKeys.filter(status => !activeOnly || isActiveStatus(status));
    const legacy = await loadOrderQueues(statuses, signal, search);
    const rows = [...new Map(legacy.rows.filter(row => !channel || row.orderType === channel).map(row => [row.id, row])).values()];
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
    const page = rows.slice((orderPage - 1) * 20, orderPage * 20);
    const byId = new Map(legacy.orders.map(order => [order.id, order]));
    return { rows: page, orders: page.map(row => byId.get(String(row.id))!), total: rows.length, pageSize: 20 };
  }
  return loadOrderPage(orderPage, signal, requestedStatus, search, { activeOnly, channel });
}
