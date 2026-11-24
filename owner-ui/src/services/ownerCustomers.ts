import { adminRequest } from './adminHttp';
import type { Customer } from '../types';
export interface CustomerSummaryDto {
  name: string;
  phone?: string;
  deliveryAddress?: string;
  purchases: { orderId: number; createdAt: string; approvedAmount: number }[];
}
export function mapCustomers(rows: CustomerSummaryDto[]): Customer[] {
  return rows.map((row, index) => ({
    id: String(index), name: row.name, email: '', phone: row.phone ?? '', deliveryAddress: row.deliveryAddress, favoriteBurger: '',
    purchases: [...row.purchases].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    ordersCount: row.purchases.length,
    totalSpent: row.purchases.reduce((sum, purchase) => sum + purchase.approvedAmount, 0),
    lastOrderDate: row.purchases.map(p => p.createdAt).sort().at(-1) ?? '',
    status: row.purchases.length <= 1 ? 'new' : 'regular',
  }));
}
export async function loadCustomers(signal?: AbortSignal) {
  return mapCustomers(await adminRequest<CustomerSummaryDto[]>('/api/admin/customers', { signal }));
}
