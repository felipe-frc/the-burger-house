import { adminRequest } from './adminHttp';
export interface OperationSettingsDto {
  revision: number;
  limits: { preparing: number; readyForPickup: number; outForDelivery: number;
    schedule?: { enabled: boolean; start?: string; end?: string } | null; pendingPaymentAgeHours?: number | null };
}
export const loadOperationSettings = (signal?: AbortSignal) => adminRequest<OperationSettingsDto>('/api/admin/operation/settings', { signal });
export async function saveOperationSettings(settings: OperationSettingsDto) {
  await adminRequest('/api/admin/operation/settings', { method: 'PUT', body: JSON.stringify(settings) });
  return loadOperationSettings();
}
