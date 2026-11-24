import { adminRequest } from './adminHttp';
import type { OrderRowDto } from './ownerOrders';
import type { NotificationItem } from '../types';
export interface NotificationBatchDto { until: string; nextAfterId: number | null; newPaidOrders: number; items: OrderRowDto[] }
export async function loadNotifications(signal?: AbortSignal, since?: string) {
  const query = new URLSearchParams(since ? { since } : {});
  let batch = await adminRequest<NotificationBatchDto>(`/api/admin/notifications?${query}`, { signal });
  const until = batch.until;
  const rows = [...batch.items];
  while (batch.nextAfterId != null) {
    query.set('until', until);
    query.set('afterId', String(batch.nextAfterId));
    const next = await adminRequest<NotificationBatchDto>(`/api/admin/notifications?${query}`, { signal });
    if (next.nextAfterId != null && next.nextAfterId <= batch.nextAfterId) throw new Error('Cursor de notificações inválido.');
    rows.push(...next.items);
    batch = next;
  }
  const items: NotificationItem[] = rows.map(row => ({
    id: String(row.id), title: `Pedido #${row.id}`, description: `Pagamento confirmado · ${row.customerName}`,
    time: row.createdAt, type: 'payment', read: false, severity: 'info',
  }));
  return { until, items };
}
