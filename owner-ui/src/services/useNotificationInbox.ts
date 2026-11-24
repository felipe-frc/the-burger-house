import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest } from './adminHttp';
import type { NotificationItem } from '../types';
import { formatOwnerDateTime, formatOwnerMoney } from './ownerPresentation';

type InboxPage = { items: { id: number; approvedAt: string; read: boolean; channel?: string; customerName?: string; amount?: number | null }[];
  beforeId: number | null; unreadCount: number };
const endpoint = '/api/admin/notifications/inbox';

export function useNotificationInbox(active: boolean, onNewApproval: () => void) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [revision, refresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);
  const previousUnread = useRef<number | null>(null);
  const [writing, setWriting] = useState(false);
  const retry = useCallback(() => refresh(value => value + 1), []);

  useEffect(() => {
    if (!active) {
      previousUnread.current = null;
      setItems([]);
      setUnread(0);
      setPageCount(1);
      setMore(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    let timer: number;
    let running = false;
    const read = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      window.clearTimeout(timer);
      try {
        const first = await adminRequest<InboxPage>(endpoint, { signal: controller.signal });
        const rows = [...first.items];
        let cursor = first.beforeId;
        for (let page = 1; page < pageCount && cursor; page++) {
          const next = await adminRequest<InboxPage>(`${endpoint}?beforeId=${cursor}`, { signal: controller.signal });
          rows.push(...next.items);
          cursor = next.beforeId;
        }
        if (controller.signal.aborted) return;
        setItems([...new Map(rows.map(row => [row.id, row])).values()].map(row => ({
          id: String(row.id), title: `Pedido #${row.id}`,
          description: ['Pagamento aprovado', row.amount != null ? formatOwnerMoney(row.amount) : null, row.customerName,
            row.channel === 'delivery' ? 'Entrega' : row.channel === 'pickup' ? 'Retirada' : null].filter(Boolean).join(' · '),
          time: formatOwnerDateTime(row.approvedAt), type: 'payment', read: row.read, severity: 'info',
        })));
        setUnread(first.unreadCount);
        if (previousUnread.current !== null && first.unreadCount > previousUnread.current) onNewApproval();
        previousUnread.current = first.unreadCount;
        setMore(cursor != null);
        setError('');
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha ao consultar notificações.');
      } finally {
        running = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = window.setTimeout(read, 15000);
        }
      }
    };
    setLoading(true);
    void read();
    window.addEventListener('online', read);
    return () => { controller.abort(); window.clearTimeout(timer); window.removeEventListener('online', read); };
  }, [active, pageCount, revision, onNewApproval]);

  const mutate = async (action: string) => {
    if (busy.current) {
      setError('Outra atualização está em andamento. Tente novamente em instantes.');
      return false;
    }
    busy.current = true;
    setWriting(true);
    try {
      await adminRequest(`${endpoint}/${action}`, { method: 'PUT' });
      retry();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar notificações.');
      return false;
    } finally {
      busy.current = false;
      setWriting(false);
    }
  };

  return { items, unread, more, error, loading, writing, retry, mutate,
    loadMore: () => setPageCount(value => value + 1) };
}
