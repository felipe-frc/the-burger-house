import { useEffect, useState } from 'react';
import { adminRequest } from './adminHttp';
import type { FinanceSummary } from './ownerFinance';
import { statusKeys, type ServerOrderStatus } from './ownerPresentation';

type QueueCount = { status: ServerOrderStatus; channel: string; count: number };
export interface Dashboard {
  today: FinanceSummary; week: FinanceSummary; month: FinanceSummary; last30Days: FinanceSummary;
  openOrders: number; newPaidOrders: number; orderCounts?: QueueCount[];
  shift?: { isOpen: boolean; start: string; end: string; summary: FinanceSummary } | null;
}

export function summarizeQueues(rows: QueueCount[], channel?: string) {
  const counts = Object.fromEntries(statusKeys.map(status => [status, 0])) as Record<ServerOrderStatus, number>;
  let delivery = 0;
  for (const row of rows) {
    if (Object.hasOwn(counts, row.status) && (!channel || channel === row.channel)) counts[row.status] += row.count;
    if (row.channel === 'delivery' && (row.status === 'ReadyForPickup' || row.status === 'OutForDelivery')) delivery += row.count;
  }
  return { counts, delivery };
}

export function useOwnerDashboard(active: boolean, ordersRevision: number) {
  const [data, setData] = useState<{ dashboard: Dashboard; rows: QueueCount[] } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) { setData(null); setError(''); return; }
    const controller = new AbortController();
    const signal = controller.signal;
    const read = async () => {
      try {
        const dashboard = await adminRequest<Dashboard>('/api/admin/dashboard', { signal });
        const rows = dashboard.orderCounts ?? await Promise.all(statusKeys.map(async status => {
          const page = await adminRequest<{ total: number }>(`/api/admin/orders?Status=${status}&Page=1`, { signal });
          return { status, channel: '', count: page.total };
        }));
        if (!signal.aborted) { setData({ dashboard, rows }); setError(''); }
      } catch (cause) {
        if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha ao carregar o painel.');
      }
    };
    void read();
    return () => controller.abort();
  }, [active, ordersRevision, revision]);
  return { data, error, retry: () => setRevision(value => value + 1) };
}
