import { useState } from 'react';
import { ArrowRight, LockKeyhole, Search } from 'lucide-react';
import { OrderStatusBadge } from '../components/common/OrderStatusBadge';
import { formatOwnerDateTime, formatOwnerMoney, isActiveStatus, orderStates, statusKeys, type ServerOrderStatus } from '../services/ownerPresentation';
import { serverStatus } from '../services/ownerOrders';
import type { Order, OrderStatus } from '../types';

interface OrdersPageProps {
  orders: Order[];
  loading: boolean;
  search: string;
  statusFilter: string;
  onSearchChange: (search: string) => void;
  onStatusFilterChange: (status: string) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  onOpenOrder: (order: Order) => void;
  pendingOrders: ReadonlySet<string>;
  counts: Partial<Record<ServerOrderStatus, number>>;
}

const activeFilters: Record<ServerOrderStatus, string> = {
  PendingPayment: 'PendingPayment', Received: 'pending', Preparing: 'preparing', ReadyForPickup: 'ready',
  OutForDelivery: 'delivering', Completed: 'completed', Cancelled: 'cancelled',
};
const nextSteps: Partial<Record<ServerOrderStatus, { status: OrderStatus; label: string }>> = {
  Received: { status: 'preparing', label: 'Iniciar preparo' },
  Preparing: { status: 'ready', label: 'Enviar à expedição' },
};

export function OrdersPage({ orders, loading, search, statusFilter, onSearchChange, onStatusFilterChange,
  onUpdateOrderStatus, onOpenOrder, pendingOrders, counts }: OrdersPageProps) {
  const [view, setView] = useState<'list' | 'board' | 'cards'>('list');
  const active = statusKeys.filter(isActiveStatus).reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const total = statusKeys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const serverStage = (order: Order) => order.serverStatus ?? serverStatus[order.status];
  const actions = (order: Order) => {
    const next = nextSteps[serverStage(order)];
    const busy = pendingOrders.has(order.id);
    return <div className="flex flex-wrap items-center gap-2">
      <button className="owner-button" onClick={() => onOpenOrder(order)} aria-label={`Ver detalhes do pedido ${order.code}`}>
        Detalhes <ArrowRight size={15} aria-hidden="true" />
      </button>
      {next && order.paymentStatus === 'PAID' && <button className="owner-button owner-primary" disabled={busy}
        onClick={() => void onUpdateOrderStatus(order.id, next.status)}>{busy ? 'Atualizando…' : next.label}</button>}
    </div>;
  };
  const cards = (rows: Order[]) => rows.map(order => <article key={order.id} className="owner-panel p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="owner-display owner-order-code">{order.code}</strong><OrderStatusBadge order={order} /></div>
    {order.isStalePayment && <span className="owner-status" data-tone="amber">Pendente antigo</span>}
    <p className="break-words">{order.customerName || 'Balcão'} · {order.deliveryType === 'DELIVERY' ? 'Entrega' : 'Retirada'}</p>
    <p className="owner-muted">{formatOwnerDateTime(order.createdAt)} · {formatOwnerMoney(order.total)}</p>
    {actions(order)}
  </article>);

  return <div className="space-y-4">
    <header className="owner-panel p-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="owner-title">Pedidos</h1><p className="owner-muted">Acompanhe os pedidos ativos e consulte o histórico.</p></div>
      <span className="owner-muted inline-flex items-center gap-2"><LockKeyhole size={16} aria-hidden="true" /> Cadastro no balcão indisponível</span>
    </header>
    <section className="owner-panel p-4 space-y-3" aria-label="Filtros de pedidos">
      <div className="flex flex-wrap justify-between gap-3">
        <label className="owner-field">
          <span><Search size={15} aria-hidden="true" /> Buscar pedidos</span>
          <input type="search" value={search} maxLength={120} placeholder="Número ou cliente" onChange={event => onSearchChange(event.target.value)} />
        </label>
        <label className="owner-field">
          <span>Visualização</span><select value={view} onChange={event => setView(event.target.value as typeof view)}>
            <option value="list">Lista</option><option value="board">Quadro por status</option><option value="cards">Cards</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Status do pedido">
        {[{ id: 'active', label: 'Ativos', count: active }, { id: 'all', label: 'Todos', count: total },
          ...statusKeys.map(key => ({ id: activeFilters[key], label: orderStates[key].label, count: counts[key] ?? 0 }))].map(tab =>
          <button key={tab.id} type="button" className="owner-button" aria-pressed={statusFilter === tab.id}
            onClick={() => onStatusFilterChange(tab.id)}>{tab.label} ({tab.count})</button>)}
      </div>
    </section>
    {loading ? <p role="status" className="owner-panel p-4">Carregando pedidos…</p>
      : orders.length === 0 ? <p className="owner-panel p-6">Nenhum pedido corresponde a estes filtros.</p>
      : view === 'list' ? <div className="owner-panel p-4 owner-table-shell"><table className="owner-table">
        <caption className="sr-only">Pedidos nesta página</caption>
        <thead><tr><th scope="col">Pedido</th><th scope="col">Cliente e canal</th><th scope="col">Status</th><th scope="col">Registro</th><th scope="col" className="text-right">Total</th><th scope="col">Ações</th></tr></thead>
        <tbody>{orders.map(order => <tr key={order.id}>
          <th scope="row" className="owner-display owner-order-code">{order.code}</th>
          <td><strong className="break-words">{order.customerName || 'Balcão'}</strong><br/><span className="owner-muted">{order.deliveryType === 'DELIVERY' ? 'Entrega' : 'Retirada'}</span></td>
          <td><OrderStatusBadge order={order} />{order.isStalePayment && <span className="owner-status mt-1" data-tone="amber">Pendente antigo</span>}</td><td>{formatOwnerDateTime(order.createdAt)}</td>
          <td className="text-right tabular-nums">{formatOwnerMoney(order.total)}</td><td>{actions(order)}</td>
        </tr>)}</tbody>
      </table></div> : view === 'cards' ? <section aria-label="Cards de pedidos" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cards(orders)}</section>
        : <div className="grid gap-4 lg:grid-cols-2">{statusKeys.map(key => {
          const group = orders.filter(order => serverStage(order) === key);
          return group.length ? <section className="space-y-2" key={key}><h2 className="owner-heading">{orderStates[key].label} ({group.length})</h2>{cards(group)}</section> : null;
        })}</div>}
  </div>;
}
