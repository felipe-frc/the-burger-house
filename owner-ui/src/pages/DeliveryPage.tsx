import { useState } from 'react';
import { Bike, PackageCheck, MapPin, Phone } from 'lucide-react';
import { formatOwnerMoney, formatOwnerDateTime, formatPayment, oldestFirst } from '../services/ownerPresentation';
import { showcaseEnabled } from '../services/ownerShowcase';
import { DeliveryTrackingModal } from '../components/orders/DeliveryTrackingModal';
import type { Order, OrderStatus } from '../types';

interface Props {
  orders: Order[];
  pendingOrders: ReadonlySet<string>;
  onUpdateOrderStatus: (id: string, status: OrderStatus) => Promise<boolean>;
  onOpenExpedition: () => void;
}
export function DeliveryPage({ orders, pendingOrders, onUpdateOrderStatus, onOpenExpedition }: Props) {
  const [trackingOrderId, setTrackingOrderId] = useState<string>();
  const delivery = orders.filter(order => order.deliveryType === 'DELIVERY');
  const awaiting = delivery.filter(order => order.status === 'ready').sort(oldestFirst);
  const inRoute = delivery.filter(order => order.status === 'delivering').sort(oldestFirst);
  const completed = delivery.filter(order => order.status === 'completed');
  const columns = [
    { label: 'Aguardando saída', rows: awaiting, empty: 'Nenhum pedido de entrega em conferência.' },
    { label: 'Em rota', rows: inRoute, empty: 'Nenhum pedido saiu para entrega.' },
    { label: 'Últimas entregas concluídas', rows: completed, empty: 'Nenhuma entrega concluída neste histórico.' },
  ];
  return <div className="space-y-4">
    <header className="owner-panel p-5"><h1 className="owner-title">Entregas</h1><p className="owner-muted">{awaiting.length + inRoute.length} em operação · saída autorizada na Expedição</p></header>
    <div className="grid gap-4 xl:grid-cols-3">
      {columns.map(column => <section key={column.label} className="space-y-3 min-w-0">
        <h2 className="owner-heading flex items-center gap-2">{column.label} <span className="owner-count">{column.rows.length}</span></h2>
        {!column.rows.length && <p className="owner-panel owner-muted p-4">{column.empty}</p>}
        <div className="owner-queue-column" aria-label={column.label} tabIndex={column.rows.length > 4 ? 0 : undefined}>{column.rows.map(order => {
          const busy = pendingOrders.has(order.id);
          return <article key={order.id} className="owner-panel owner-queue-card p-4 space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="owner-display">{order.code}</h3><span className="tabular-nums">{formatOwnerMoney(order.total)}</span>
            </header>
            <p className="font-semibold break-words">{order.customerName}</p>
            {order.deliveryAddress && <p className="flex items-start gap-2 owner-muted"><MapPin size={16} className="shrink-0" aria-hidden="true"/>{order.deliveryAddress}</p>}
            {order.customerPhone && <p className="flex items-start gap-2 owner-muted"><Phone size={16} aria-hidden="true"/>{order.customerPhone}</p>}
            {order.driverName && <p className="owner-muted">Responsável · {order.driverName}</p>}
            {order.status === 'completed' ? <p className="owner-muted">{order.stageStartedAt ? formatOwnerDateTime(order.stageStartedAt) : 'Concluído'}</p>
              : <div className="flex flex-wrap gap-2">
                <span className="owner-status" data-tone={order.paymentStatus === 'PAID' ? 'teal' : 'amber'}>{formatPayment(order.paymentStatus)} · {formatPayment(order.paymentMethod)}</span>
                {order.stageStartedAt && <span className="owner-status" data-tone={order.isDelayed ? 'red' : 'violet'}>{order.isDelayed && 'Atrasado · '}{order.elapsedMinutes} min</span>}
              </div>}
            {order.status === 'ready' && <button type="button" className="owner-button w-full" onClick={onOpenExpedition}><PackageCheck size={17} aria-hidden="true"/> Conferir na expedição</button>}
            {order.status === 'delivering' && <button type="button" className="owner-button owner-success w-full" disabled={busy || order.paymentStatus !== 'PAID'}
              onClick={() => void onUpdateOrderStatus(order.id, 'completed')}>
              <Bike size={17} aria-hidden="true"/> {busy ? 'Atualizando…' : 'Confirmar Entrega Realizada'}
            </button>}
            {order.status === 'delivering' && !showcaseEnabled() && <button type="button" className="owner-button w-full" onClick={() => setTrackingOrderId(order.id)}>
              <MapPin size={17} aria-hidden="true" /> Acompanhar entrega
            </button>}
            {order.status === 'delivering' && order.paymentStatus !== 'PAID' && <p className="owner-muted">A conclusão exige pagamento aprovado.</p>}
          </article>;
        })}</div>
      </section>)}
    </div>
    {trackingOrderId && <DeliveryTrackingModal key={trackingOrderId} id={trackingOrderId} onClose={() => setTrackingOrderId(undefined)} />}
  </div>;
}
