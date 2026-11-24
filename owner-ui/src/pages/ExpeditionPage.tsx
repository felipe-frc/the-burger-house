import React, { useId, useState } from 'react';
import { formatOwnerTime, oldestFirst } from '../services/ownerPresentation';
import { PackageCheck, CheckSquare, Square, ArrowRight, Bike, Store, Utensils } from 'lucide-react';
import { Order, OrderStatus } from '../types';
import type { DispatchChecklist } from '../services/ownerOrders';

interface ExpeditionPageProps {
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, checklist: DispatchChecklist) => Promise<boolean>;
}

export const ExpeditionPage: React.FC<ExpeditionPageProps> = ({
  orders,
  onUpdateOrderStatus,
}) => {
  const [checks, setChecks] = useState<Record<string, Record<string, boolean>>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const toggleCheck = (id: string, field: string) => setChecks(current => ({
    ...current, [id]: { ...current[id], [field]: !current[id]?.[field] },
  }));
  const checklistPrefix = useId();
  const readyOrders = orders.filter(order => order.status === 'ready').sort(oldestFirst);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="owner-panel rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="owner-module-icon">
            <PackageCheck size={21} aria-hidden="true" />
          </div>
          <div>
            <h1 className="owner-title">Expedição</h1>
            <p className="text-xs font-['Barlow_Condensed'] uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Conferência de itens, embalagem e identificação para liberar o pedido
            </p>
          </div>
        </div>

        <div className="px-3.5 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-xs font-['Barlow_Condensed'] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
          <span>{readyOrders.length} Pedidos Aguardando Conferência</span>
        </div>
      </div>

      {readyOrders.length === 0 ? (
        <div className="py-20 text-center text-slate-600 dark:text-slate-300 owner-panel rounded-3xl">
          <PackageCheck size={48} className="mx-auto mb-3 opacity-35 text-sky-500" />
          <h3 className="font-['Anton'] text-xl uppercase tracking-wide text-slate-800 dark:text-white">
            Expedição em Dia!
          </h3>
          <p className="font-['Barlow_Condensed'] text-sm uppercase tracking-wider mt-1">
            Nenhum pedido aguardando conferência de embalagem.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {readyOrders.map((order) => {
            const checklist = checks[order.id] || {};
            const checkedCount = order.items.filter((i) => checklist[i.id]).length;
            const dispatch = {
              items: order.items.length > 0 && checkedCount === order.items.length,
              packaging: !!checklist.packaging,
              identification: !!checklist.identification,
            };
            const isAllChecked = dispatch.items && dispatch.packaging && dispatch.identification;
            const checked = checkedCount + Number(dispatch.packaging) + Number(dispatch.identification);
            const needed = order.items.length + 2;
            const hintId = checklistPrefix + order.id;

            return (
              <article aria-label={`Conferência do pedido ${order.code}`}
                key={order.id}
                className="owner-panel owner-queue-card p-5 flex flex-col"
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10 mb-3 gap-2">
                    <div className="min-w-0">
                      <span className="font-['Anton'] text-2xl text-slate-900 dark:text-white tracking-wider block">
                        {order.code}
                      </span>
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate block">
                        {order.customerName || 'Balcão'}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-['Barlow_Condensed'] font-bold uppercase tracking-wider ${
                          isAllChecked
                            ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <span>
                          {checked}/{needed} conferências
                        </span>
                      </span>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 flex items-center justify-end gap-1">
                        {order.deliveryType === 'DELIVERY' ? (
                          <Bike size={12} />
                        ) : order.deliveryType === 'TAKEOUT' ? (
                          <Store size={12} />
                        ) : (
                          <Utensils size={12} />
                        )}
                        <span>
                          {order.deliveryType === 'DELIVERY'
                            ? 'Entrega'
                            : order.deliveryType === 'TAKEOUT'
                              ? 'Balcão'
                              : 'Salão'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <p className="owner-muted mb-2">{order.stageStartedAt
                    ? `Em conferência há ${order.elapsedMinutes} min · ${formatOwnerTime(order.stageStartedAt)}`
                    : 'Em conferência'}{order.isDelayed && ' · Atrasado'}</p>
                  {/* Destination Info */}
                  {order.deliveryAddress && (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.05] text-xs text-slate-700 dark:text-slate-200 mb-3">
                      <span className="font-['Barlow_Condensed'] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-0.5">
                        Destino:
                      </span>
                      <p className="truncate">{order.deliveryAddress}</p>
                    </div>
                  )}

                  {/* Checklist of Items */}
                  <div className="space-y-2 mb-4">
                    <span className="text-[11px] font-['Barlow_Condensed'] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                      Toque para conferir cada item na embalagem:
                    </span>
                    {order.items.map((item) => {
                      const isItemChecked = !!checklist[item.id];
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={isItemChecked}
                          disabled={submitting !== null}
                          onClick={() => toggleCheck(order.id, item.id)}
                          className={`w-full min-h-11 text-left p-3 rounded-2xl flex items-center justify-between cursor-pointer border transition-all ${
                            isItemChecked
                              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-900 dark:text-emerald-100'
                              : 'bg-white dark:bg-white/[0.06] border-black/5 dark:border-white/10 text-slate-900 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isItemChecked ? (
                              <CheckSquare size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <Square size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-semibold truncate ${
                                  isItemChecked ? 'line-through opacity-75' : ''
                                }`}
                              >
                                {item.quantity}x {item.name}
                              </p>
                              {item.notes && (
                                <p className="text-[10px] text-amber-800 dark:text-amber-300 italic">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                          </div>
                          {item.category && <span className="owner-muted text-xs text-right ml-2">
                            {({ menu: 'Hambúrguer', burgers: 'Hambúrguer', sides: 'Acompanhamento', drinks: 'Bebida' } as Record<string, string>)[item.category] ?? item.category}
                          </span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <fieldset className="mb-3 space-y-2 text-xs" disabled={submitting !== null}>
                  <legend className="sr-only">Conferência de expedição {order.code}</legend>
                  <label className="owner-check"><input type="checkbox" checked={dispatch.packaging} onChange={() => toggleCheck(order.id, 'packaging')} /> Embalagem conferida</label>
                  <label className="owner-check"><input type="checkbox" checked={dispatch.identification} onChange={() => toggleCheck(order.id, 'identification')} /> Identificação conferida</label>
                </fieldset>
                {/* Release Order Action */}
                <div className="pt-3 mt-auto border-t border-black/10 dark:border-white/10">
                  <button
                    type="button"
                    aria-describedby={hintId}
                    disabled={!isAllChecked || submitting !== null || order.paymentStatus !== 'PAID'}
                    onClick={async () => {
                      const nextStatus =
                        order.deliveryType === 'DELIVERY' ? 'delivering' : 'completed';
                      setSubmitting(order.id);
                      try {
                        if (await onUpdateOrderStatus(order.id, nextStatus, dispatch)) {
                          setChecks(current => {
                            const next = { ...current };
                            delete next[order.id];
                            return next;
                          });
                        }
                      } finally {
                        setSubmitting(null);
                      }
                    }}
                    className="owner-button owner-success w-full"
                  >
                    {submitting === order.id ? <span>Atualizando…</span> : <span>
                      {order.deliveryType === 'DELIVERY'
                        ? 'Liberar para Motoboy / Rota'
                        : 'Liberar Entrega no Balcão'}
                    </span>}
                    <ArrowRight size={16} />
                  </button>
                  <p id={hintId} className="owner-muted text-xs mt-1">{order.paymentStatus !== 'PAID' ? 'A liberação exige pagamento aprovado.'
                    : needed - checked > 1 ? `Faltam ${needed - checked} conferências.`
                      : needed - checked === 1 ? 'Falta 1 conferência.' : isAllChecked ? 'Pedido conferido.' : 'O pedido precisa ter itens.'}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
