import { adminRequest } from './adminHttp';

export interface DeliveryTrackingState {
  orderId: number;
  courierName: string | null;
  state: 'Unassigned' | 'Waiting' | 'Stopped' | 'Active' | 'Stale' | 'Expired';
  lastReportedAtUtc: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

const path = '/api/admin/delivery-tracking';
export const loadCouriers = (signal?: AbortSignal) => adminRequest<{ id: number; name: string }[]>(path + '/couriers', { signal });
export const loadDeliveryTracking = (id: string, signal?: AbortSignal) =>
  adminRequest<DeliveryTrackingState>(`${path}/${encodeURIComponent(id)}`, { signal });
export const grantDeliveryTracking = (id: string, courierId: number) =>
  adminRequest<{ orderId: number; token: string; expiresAtUtc: string }>(`${path}/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ courierId }),
  });
export const revokeDeliveryTracking = (id: string) =>
  adminRequest(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' });
