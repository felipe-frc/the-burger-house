import { orderStates } from '../../services/ownerPresentation';
import { serverStatus } from '../../services/ownerOrders';
import type { Order } from '../../types';

export function OrderStatusBadge({ order }: { order: Order }) {
  const status = orderStates[order.serverStatus ?? serverStatus[order.status]];
  return <span className="owner-status" data-tone={status.tone}><span aria-hidden="true">{status.icon}</span> {status.label}</span>;
}
