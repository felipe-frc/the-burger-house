import React, { useState } from 'react';
import { formatOwnerDateTime, formatPayment, orderStates } from '../../services/ownerPresentation';
import { OrderStatusBadge } from '../common/OrderStatusBadge';
import { ArrowRight } from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { Modal } from '../common/Modal';
import { CurrencyValue } from '../common/CurrencyValue';

interface OrderDetailModalProps {
  order: Order | null;
  onClose: () => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  onClose,
  onUpdateStatus,
}) => {
  const [pending, setPending] = useState(false);
  if (!order) return null;

  const nextStatusMap: Partial<
    Record<OrderStatus, { next: OrderStatus; label: string }>
  > = {
    pending: { next: 'preparing', label: 'Enviar para Cozinha' },
    preparing: { next: 'ready', label: 'Marcar como Pronto' },
    delivering: { next: 'completed', label: 'Confirmar Entrega Concluída' },
  };

  const nextAction = order.paymentStatus === 'PAID' ? nextStatusMap[order.status] : undefined;

  return (
    <Modal
      isOpen={!!order}
      onClose={onClose}
      title={`Pedido ${order.code}`}
      subtitle={`Registrado em ${formatOwnerDateTime(order.createdAt)}`}
      maxWidthClass="max-w-lg"
      footer={
        nextAction ? (
          <div className="flex flex-col sm:flex-row gap-2">
            {nextAction && (
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  if (pending) return;
                  setPending(true);
                  try { if (await onUpdateStatus(order.id, nextAction.next)) onClose(); }
                  finally { setPending(false); }
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl owner-button owner-primary font-['Barlow_Condensed'] font-bold uppercase tracking-wider text-sm transition-all"
              >
                <span>{pending ? 'Atualizando…' : nextAction.label}</span>
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {order.status === 'ready' && <p className="text-xs">Libere o pedido na Expedição após concluir a conferência.</p>}
        {/* Status badge row */}
        <div className="flex items-center justify-between gap-2">
          <OrderStatusBadge order={order} />
          <span className="owner-muted text-xs">
            {order.stageStartedAt ? `Nesta etapa desde ${formatOwnerDateTime(order.stageStartedAt)}` : ''}
          </span>
        </div>

        {/* Customer & Delivery Details */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-white/[0.06] border border-black/5 dark:border-white/10 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600 dark:text-slate-300 font-['Barlow_Condensed'] uppercase tracking-wider">
              Cliente:
            </span>
            <span className="font-semibold text-slate-900 dark:text-white text-right">
              {order.customerName}
            </span>
          </div>
          {order.customerPhone && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600 dark:text-slate-300 font-['Barlow_Condensed'] uppercase tracking-wider">
                Telefone:
              </span>
              <span className="text-slate-700 dark:text-slate-200">
                {order.customerPhone}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600 dark:text-slate-300 font-['Barlow_Condensed'] uppercase tracking-wider">
              Modalidade:
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {order.deliveryType === 'DELIVERY'
                ? 'Entrega em Domicílio'
                : order.deliveryType === 'TAKEOUT'
                  ? 'Retirada no Balcão'
                  : 'Consumo no Salão'}
            </span>
          </div>
          {order.deliveryAddress && (
            <div className="flex items-start justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-300 font-['Barlow_Condensed'] uppercase tracking-wider shrink-0">
                Endereço:
              </span>
              <span className="text-slate-700 dark:text-slate-200 text-right leading-tight">
                {order.deliveryAddress}
              </span>
            </div>
          )}
        </div>

        {/* Items List */}
        <div>
          <h4 className="text-xs font-['Barlow_Condensed'] uppercase tracking-wider font-bold text-slate-600 dark:text-slate-300 mb-2">
            Itens do Pedido ({order.items.length})
          </h4>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-xl bg-white dark:bg-white/[0.06] border border-black/5 dark:border-white/10"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-50 flex items-center justify-center text-xs shrink-0">
                      {item.quantity}x
                    </span>
                    <span className="truncate">{item.name}</span>
                  </div>
                  <CurrencyValue value={item.totalPrice} size="xs" className="shrink-0" />
                </div>
                {item.notes && (
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-500/15 px-2 py-1 rounded-md mt-1.5 italic">
                    Obs: {item.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {!!order.stageHistory?.length && <section>
          <h3 className="owner-heading mb-2">Histórico do pedido</h3>
          <ol className="space-y-2">{order.stageHistory.map((entry, index) => <li key={index} className="owner-panel p-2 flex flex-wrap justify-between gap-2">
            <span>{orderStates[entry.status]?.label ?? 'Status atualizado'}</span>
            <time dateTime={entry.changedAt} className="owner-muted">{formatOwnerDateTime(entry.changedAt)}</time>
          </li>)}</ol>
        </section>}

        {/* Financial Summary */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-white/[0.06] border border-black/5 dark:border-white/10 space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
            <span>Subtotal:</span>
            <CurrencyValue value={order.subtotal} size="xs" />
          </div>
          {order.deliveryFee > 0 && (
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>Taxa de Entrega:</span>
              <CurrencyValue value={order.deliveryFee} size="xs" />
            </div>
          )}
          {order.discount > 0 && (
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span>Desconto Cupom:</span>
              <CurrencyValue value={-order.discount} size="xs" />
            </div>
          )}
          <div className="flex items-center justify-between text-base font-bold text-slate-900 dark:text-white pt-1.5 border-t border-black/10 dark:border-white/10">
            <span className="font-['Barlow_Condensed'] uppercase tracking-wider">Total:</span>
            <span className="font-['Anton'] tracking-wide text-[#E85D4A]">
              <CurrencyValue value={order.total} size="lg" />
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 pt-1">
            <span>Pagamento: {formatPayment(order.paymentMethod)}</span>
            <span
              className={`font-semibold ${
                order.paymentStatus === 'PAID'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-300'
              }`}
            >
              {formatPayment(order.paymentStatus)}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
