import type { Order } from '../types';
import type { RevenuePoint } from './ownerFinance';
import { isKitchenOrder, utcInstant } from './ownerPresentation';

export function kitchenTimingSummary(orders: Order[]) {
  const kitchen = orders.filter(isKitchenOrder);
  const measured = kitchen.filter(order => {
    const since = order.stageStartedAt ?? (order.status === 'pending' ? order.createdAt : undefined);
    return since !== undefined && Number.isFinite(utcInstant(since));
  });
  return {
    total: kitchen.length,
    measured: measured.length,
    delayed: measured.filter(order => order.isDelayed).length,
    meanMinutes: measured.length ? Math.round(measured.reduce((sum, order) => sum + order.elapsedMinutes, 0) / measured.length) : null,
  };
}

export function hasSingleRevenueDay(points: RevenuePoint[], days: number) {
  return points.length === days && points.filter(point => point.revenue > 0).length === 1 &&
    points.every((point, index) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && point.revenue >= 0 &&
      Number.isFinite(Date.parse(point.date)) &&
      (index === 0 || Date.parse(point.date) - Date.parse(points[index - 1].date) === 86400000));
}
