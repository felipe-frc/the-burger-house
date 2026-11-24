import { useState } from 'react';
import { Bike, Clock, Flame, PackageCheck, Store } from 'lucide-react';
import { formatOwnerTime, oldestFirst } from '../services/ownerPresentation';
import type { Order, OrderStatus } from '../types';

interface Props {
  orders: Order[];
  onUpdateOrderStatus: (id: string, status: OrderStatus) => Promise<boolean>;
  pendingOrders: ReadonlySet<string>;
  limit: number;
  limitError: boolean;
}
export function KitchenPage({ orders, onUpdateOrderStatus, pendingOrders, limit, limitError }: Props) {
  const [lane, setLane] = useState('all');
  const stages = [
    { type: 'Received', status: 'pending', title: 'Fila de Produção', action: 'Iniciar Preparo na Chapa', next: 'preparing', icon: Flame },
    { type: 'Preparing', status: 'preparing', title: 'Em Preparo', action: 'Marcar como Pronto (Expedição)', next: 'ready', icon: PackageCheck },
  ] as const;

  return <div className="space-y-4">
    <header className="owner-panel p-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="owner-title">Cozinha</h1><p className="owner-muted">{limitError ? 'Metas de preparo indisponíveis'
        : limit > 0 ? `Meta por etapa · ${limit} min` : 'Meta de preparo desativada'}</p></div>
      <label className="owner-field"><span>Fila da cozinha</span><select value={lane} onChange={event => setLane(event.target.value)}>
        <option value="all">Todas as filas</option><option value="Received">Fila de produção</option><option value="Preparing">Em preparo</option>
      </select></label>
    </header>
    <div className={lane === 'all' ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'}>
      {stages.filter(stage => lane === 'all' || lane === stage.type).map(stage => {
        const queue = orders.filter(order => order.status === stage.status && order.serverStatus !== 'PendingPayment')
          .sort((a, b) => Number(!!b.isDelayed) - Number(!!a.isDelayed) || oldestFirst(a, b));
        return <section key={stage.type} aria-label={stage.type === 'Received' ? 'Pedidos recebidos' : 'Pedidos em preparo'} className="min-w-0 space-y-3">
          <h2 className="owner-heading flex items-center gap-2"><stage.icon size={20} aria-hidden="true"/>{stage.title} <span className="owner-count">{queue.length}</span></h2>
          {!queue.length ? <p className="owner-panel owner-muted p-5">Nenhum pedido nesta fila.</p> : <div className="owner-queue-column" tabIndex={queue.length > 4 ? 0 : undefined} aria-label={`Fila: ${stage.title}`}>
            {queue.map(order => {
              const busy = pendingOrders.has(order.id);
              const paid = order.paymentStatus === 'PAID';
              const Channel = order.deliveryType === 'DELIVERY' ? Bike : Store;
              return <article key={order.id} aria-label={`Pedido ${order.code}`} className="owner-panel owner-queue-card owner-queue-card-compact p-4 space-y-3">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div><h3 className="owner-kds-number owner-kds-number-compact">{order.code}</h3>
                    <span className="flex items-center gap-2 owner-muted"><Channel size={20} aria-hidden="true"/>{order.deliveryType === 'DELIVERY' ? 'Entrega' : 'Retirada'} · {order.customerName || 'Balcão'}</span>
                  </div>
                  <div className="text-right"><span className="owner-status" data-tone={order.isDelayed ? 'red' : 'slate'}>
                    <Clock size={16} aria-hidden="true"/>{order.isDelayed && 'Atrasado · '}{order.elapsedMinutes} min
                    {order.estimatedMinutes > 0 && ` / ${order.estimatedMinutes} min`}
                  </span><p className="owner-muted text-xs">Entrada {formatOwnerTime(order.createdAt)}</p></div>
                </header>
                <ul className="space-y-2">{order.items.map(item => <li key={item.id} className="owner-kds-item" data-side={item.category === 'sides' || item.category === 'drinks'}>
                  <span className="owner-count">{item.quantity}</span> <strong>{item.name}</strong>
                  {item.notes && <p className="owner-status" data-tone="amber">Observação · {item.notes}</p>}
                </li>)}</ul>
                {!paid && <p className="owner-muted">Pagamento sem aprovação. Confira o pedido antes de avançar.</p>}
                <button type="button" disabled={busy || !paid} className={`owner-button w-full ${stage.type === 'Received' ? 'owner-warning' : 'owner-success'}`}
                  onClick={() => void onUpdateOrderStatus(order.id, stage.next)}>{busy ? 'Atualizando…' : stage.action}</button>
              </article>;
            })}
          </div>}
        </section>;
      })}
    </div>
  </div>;
}
