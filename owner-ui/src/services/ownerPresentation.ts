import type { Order } from '../types';
import type { OperationSettingsDto } from './ownerSettings';

export const ownerTimeZone = 'America/Sao_Paulo';
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentage = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: ownerTimeZone, dateStyle: 'short', timeStyle: 'short' });
const time = new Intl.DateTimeFormat('pt-BR', { timeZone: ownerTimeZone, hour: '2-digit', minute: '2-digit' });

export function utcInstant(value: string): number {
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`);
}

export function formatOwnerDateTime(value: string) {
  const instant = utcInstant(value);
  return Number.isFinite(instant) ? dateTime.format(instant) : '—';
}

export function formatOwnerTime(value: string) {
  const instant = utcInstant(value);
  return Number.isFinite(instant) ? time.format(instant) : '—';
}
export function isOnShift(shift: string, now: number) {
  const parts = /^([01]\d|2[0-3]):([0-5]\d)\s*[-–]\s*([01]\d|2[0-3]):([0-5]\d)$/.exec(shift.trim());
  if (!parts) return false;
  const start = Number(parts[1]) * 60 + Number(parts[2]);
  const end = Number(parts[3]) * 60 + Number(parts[4]);
  const [hours, minutes] = time.format(now).split(':').map(Number);
  const current = hours * 60 + minutes;
  return start < end ? current >= start && current < end : start > end && (current >= start || current < end);
}

export const formatOwnerMoney = (value: number) => brl.format(value);
export const formatOwnerPercentage = (value: number) => `${percentage.format(value)}%`;

export const orderStates = {
  PendingPayment: { label: 'Aguardando pagamento', icon: '◷', tone: 'amber' },
  Received: { label: 'Recebido', icon: '↓', tone: 'sky' },
  Preparing: { label: 'Em preparo', icon: '◒', tone: 'orange' },
  ReadyForPickup: { label: 'Em conferência', icon: '▣', tone: 'teal' },
  OutForDelivery: { label: 'Em rota', icon: '↗', tone: 'violet' },
  Completed: { label: 'Concluído', icon: '✓', tone: 'slate' },
  Cancelled: { label: 'Cancelado', icon: '×', tone: 'red' },
} as const;
export type ServerOrderStatus = keyof typeof orderStates;
export const statusKeys = Object.keys(orderStates) as ServerOrderStatus[];
export const isActiveStatus = (status: ServerOrderStatus) => status !== 'Completed' && status !== 'Cancelled';
export const paymentLabels: Record<string, string> = {
  Pix: 'Pix', PIX: 'Pix', CreditCard: 'Crédito', CREDIT_CARD: 'Crédito', DebitCard: 'Débito', DEBIT_CARD: 'Débito',
  CASH: 'Dinheiro', Approved: 'Pago', PAID: 'Pago', Pending: 'Pendente', PENDING: 'Pendente',
  Rejected: 'Recusado', FAILED: 'Falhou', Cancelled: 'Cancelado', Refunded: 'Estornado', REFUNDED: 'Estornado',
  PartiallyRefunded: 'Estornado parcialmente', ChargedBack: 'Contestação', UNKNOWN: 'Não identificado',
};
export const formatPayment = (value: string) => paymentLabels[value] ?? 'Não identificado';

export function elapsedMinutes(since: string, now: number) {
  const instant = utcInstant(since);
  return Number.isFinite(instant) ? Math.max(0, Math.floor((now - instant) / 60000)) : 0;
}

export function isKitchenOrder(order: Order) {
  return order.paymentStatus === 'PAID' && (order.status === 'pending' || order.status === 'preparing');
}

export function withOperationalTiming(order: Order, now: number, limits: OperationSettingsDto['limits']) {
  const target = isKitchenOrder(order) ? limits.preparing : order.status === 'ready' ? limits.readyForPickup
    : order.status === 'delivering' ? limits.outForDelivery : 0;
  const since = order.stageStartedAt ?? (order.status === 'pending' ? order.createdAt : undefined);
  const elapsed = since ? elapsedMinutes(since, now) : order.elapsedMinutes;
  const threshold = limits.pendingPaymentAgeHours ?? 0;
  return { ...order, elapsedMinutes: elapsed, estimatedMinutes: target, isDelayed: !!since && target > 0 && elapsed >= target,
    isStalePayment: order.serverStatus === 'PendingPayment' && threshold > 0 && elapsedMinutes(order.createdAt, now) >= threshold * 60 };
}

export const oldestFirst = (a: Order, b: Order) =>
  utcInstant(a.stageStartedAt ?? a.createdAt) - utcInstant(b.stageStartedAt ?? b.createdAt) || a.id.localeCompare(b.id, 'pt-BR', { numeric: true });

export function statusDistribution(counts: Partial<Record<ServerOrderStatus, number>>) {
  const total = statusKeys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  return { total, states: statusKeys.map(key => ({
    key, ...orderStates[key], count: counts[key] ?? 0, percentage: total ? (counts[key] ?? 0) * 100 / total : 0,
  })) };
}
