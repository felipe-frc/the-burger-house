import { useEffect, useState } from 'react';
import { adminRequest } from './adminHttp';
import { utcInstant } from './ownerPresentation';
import type { OrderRowDto } from './ownerOrders';

export interface PendingPaymentSnapshot { count: number; oldestCreatedAt: string | null }

/** Existing thin list: one page, oldest first, no detail requests or N+1. */
export async function loadOldestPendingPayment(channel?: string, signal?: AbortSignal): Promise<PendingPaymentSnapshot> {
  const query = new URLSearchParams({ Status: 'PendingPayment', Sort: 'oldest', Page: '1' });
  if (channel) query.set('Channel', channel);
  const page = await adminRequest<{ items: OrderRowDto[]; total: number }>(`/api/admin/orders?${query}`, { signal });
  if (!Number.isInteger(page.total) || page.total < 0 || !Array.isArray(page.items) || page.items.length > page.total)
    throw new Error('Resposta inválida ao consultar a pendência mais antiga.');
  if (page.total === 0) return { count: 0, oldestCreatedAt: null };
  if (!page.items.length || page.items.some((row, i) => row.status !== 'PendingPayment' ||
      (channel && row.orderType !== channel) || !Number.isFinite(utcInstant(row.createdAt)) ||
      (i > 0 && utcInstant(row.createdAt) < utcInstant(page.items[i - 1].createdAt))))
    throw new Error('Horários ou ordenação da lista de pendências indisponíveis.');
  return { count: page.total, oldestCreatedAt: page.items[0].createdAt };
}

export function useOwnerPendingPayment(revision: number, channel: string | undefined, count: number | null) {
  const scope = channel ?? 'all';
  const [result, setResult] = useState<{ scope: string; data: PendingPaymentSnapshot | null; error: string }>({ scope, data: null, error: '' });
  useEffect(() => {
    if (count == null || count === 0) return;
    const controller = new AbortController();
    void loadOldestPendingPayment(channel, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ scope, data, error: '' });
    }).catch(cause => {
      if (!controller.signal.aborted) setResult({ scope, data: null,
        error: cause instanceof Error ? cause.message : 'Falha ao consultar pendências.' });
    });
    return () => controller.abort();
  }, [revision, channel, count, scope]);
  // Never reuse evidence from another channel or a divergent population.
  const data = count === 0 ? { count: 0, oldestCreatedAt: null } :
    result.scope === scope && result.data?.count === count ? result.data : null;
  return { data, error: result.scope === scope && count !== 0 ? result.error : '' };
}
