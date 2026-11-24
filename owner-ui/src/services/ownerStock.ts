import { adminRequest } from './adminHttp';

export interface StockRecord {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  minimum: number;
  revision: number;
}
export interface StockMovement {
  id: string;
  delta: number;
  balance: number;
  reason: string;
  createdAt: string;
}
export const isLowStock = (item: StockRecord) => item.quantity < item.minimum;

export function stockCondition(item: StockRecord) {
  const shortage = Math.max(0, Math.round((item.minimum - item.quantity) * 1000) / 1000);
  const state = item.quantity === 0 ? 'empty' : isLowStock(item) ? 'low' : 'adequate';
  return { shortage, state };
}

export function stockIndicators(items: StockRecord[]) {
  return {
    total: items.length,
    low: items.filter(isLowStock).length,
    empty: items.filter(item => item.quantity === 0).length,
    adequate: items.filter(item => stockCondition(item).state === 'adequate').length,
  };
}
const path = '/api/admin/stock';
export const loadStock = (signal?: AbortSignal) => adminRequest<StockRecord[]>(path, { signal });
export const createStock = (body: Pick<StockRecord, 'name' | 'unit' | 'minimum'>) =>
  adminRequest<StockRecord>(path, { method: 'POST', body: JSON.stringify(body) });
export const moveStock = (id: number, requestId: string, revision: number, delta: number, reason: string) =>
  adminRequest(`${path}/${id}/movements`, { method: 'POST', body: JSON.stringify({ requestId, revision, delta, reason }) });
export const loadStockHistory = (id: number, page: number, signal?: AbortSignal) =>
  adminRequest<StockMovement[]>(`${path}/${id}/movements?page=${page}`, { signal });
