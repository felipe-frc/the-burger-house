import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ShoppingBag, Utensils, Users, ArrowRight } from 'lucide-react';
import { Order, MenuItem, Customer } from '../../types';
import { NavModule } from './Sidebar';
import { CurrencyValue } from '../common/CurrencyValue';
import { formatItemsCount, formatOrdersCount } from '../../services/metricsService';
import { loadOrderPage } from '../../services/ownerOrders';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  menu: MenuItem[];
  customers: Customer[];
  onNavigateToModule: (module: NavModule) => void;
  onSelectOrder: (order: Order) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  orders,
  menu,
  customers,
  onNavigateToModule,
  onSelectOrder,
}) => {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<{ query: string; orders?: Order[]; error?: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const cleanQuery = query.toLocaleLowerCase('pt-BR').trim();

  useEffect(() => {
    if (!isOpen || !cleanQuery) return;
    const request = new AbortController();
    const timer = window.setTimeout(() => {
      loadOrderPage(1, request.signal, '', cleanQuery).then(result => {
        if (!request.signal.aborted) setRemote({ query: cleanQuery, orders: result.orders });
      }).catch(error => {
        if (!request.signal.aborted) setRemote({ query: cleanQuery, error: error.message });
      });
    }, 250);
    return () => { window.clearTimeout(timer); request.abort(); };
  }, [isOpen, cleanQuery]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const options = dialogRef.current?.querySelectorAll<HTMLElement>('input,button:not([disabled]),a[href]');
        if (!options?.length) return;
        const first = options[0];
        const last = options[options.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modulesList = [
    { label: 'Visão Geral', mod: 'overview' as NavModule },
    { label: 'Central de Pedidos', mod: 'orders' as NavModule },
    { label: 'KDS Cozinha', mod: 'kitchen' as NavModule },
    { label: 'Expedição', mod: 'expedition' as NavModule },
    { label: 'Entregas', mod: 'delivery' as NavModule },
    { label: 'Cardápio', mod: 'menu' as NavModule },
    { label: 'Estoque', mod: 'stock' as NavModule },
    { label: 'Financeiro', mod: 'financial' as NavModule },
    { label: 'Clientes', mod: 'customers' as NavModule },
    { label: 'Relatórios', mod: 'reports' as NavModule },
    { label: 'Equipe', mod: 'team' as NavModule },
    { label: 'Configurações', mod: 'settings' as NavModule },
  ];

  const filteredModules = cleanQuery
    ? modulesList.filter((m) => m.label.toLowerCase().includes(cleanQuery))
    : modulesList.slice(0, 4);

  const localOrders = cleanQuery
    ? orders.filter(
        (o) =>
          o.code.toLowerCase().includes(cleanQuery) ||
          o.customerName.toLowerCase().includes(cleanQuery) ||
          o.items.some((i) => i.name.toLowerCase().includes(cleanQuery))
      )
    : orders.slice(0, 3);
  const result = remote?.query === cleanQuery ? remote : null;
  const filteredOrders = [...new Map([...localOrders, ...(result?.orders ?? [])].map(order => [order.id, order])).values()];

  const filteredMenu = cleanQuery
    ? menu.filter(
        (m) =>
          m.name.toLowerCase().includes(cleanQuery) ||
          m.description.toLowerCase().includes(cleanQuery)
      )
    : menu.slice(0, 3);

  const filteredCustomers = cleanQuery
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(cleanQuery) ||
          c.phone.includes(cleanQuery)
      )
    : customers.slice(0, 2);

  const hasAnyResults =
    filteredModules.length > 0 ||
    filteredOrders.length > 0 ||
    filteredMenu.length > 0 ||
    filteredCustomers.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-slate-950/55 dark:bg-black/65"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl owner-dialog-surface rounded-3xl p-5 overflow-hidden"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 pb-3 border-b border-slate-900/10 dark:border-white/10">
          <Search size={20} className="text-slate-500 dark:text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            aria-label="Buscar no painel"
            maxLength={120}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código de pedido, cliente, lanche ou módulo..."
            className="w-full bg-transparent text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none text-base font-['Barlow_Condensed'] tracking-wide"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
              className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            ESC
          </button>
        </div>

        {/* Results Container */}
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin pt-3.5 space-y-4">
          {!hasAnyResults ? (
            <div className="py-12 text-center text-slate-500 dark:text-slate-400">
              <Search size={32} className="mx-auto mb-2 opacity-35" />
              <p className="font-['Barlow_Condensed'] uppercase tracking-wider text-sm font-semibold">
                {result?.error ? 'Não foi possível buscar pedidos.' : !result && cleanQuery ? 'Buscando pedidos…' : <>Nenhum resultado para &ldquo;{query}&rdquo;</>}
              </p>
              <p className="text-xs mt-1">
                Tente buscar pelo código do pedido (#1048), nome de lanche ou cliente.
              </p>
            </div>
          ) : (
            <>
              {/* Quick Navigation Sections */}
              {filteredModules.length > 0 && (
                <div>
                  <p className="text-[11px] font-['Barlow_Condensed'] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                    Módulos do Sistema
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {filteredModules.map((sec) => (
                      <button
                        key={sec.mod}
                        type="button"
                        onClick={() => {
                          onNavigateToModule(sec.mod);
                          onClose();
                        }}
                        className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-black/5 dark:border-white/10 text-xs text-left transition-colors"
                      >
                        <span className="font-['Barlow_Condensed'] font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {sec.label}
                        </span>
                        <ArrowRight size={12} className="text-slate-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Orders Results */}
              {filteredOrders.length > 0 && (
                <div>
                  <p className="text-[11px] font-['Barlow_Condensed'] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <ShoppingBag size={13} />
                    <span>Pedidos da página atual</span>
                  </p>
                  <div className="space-y-1.5">
                    {filteredOrders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => {
                          onSelectOrder(order);
                          onClose();
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-black/5 dark:border-white/10 transition-all text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-['Anton'] text-sm text-[#E85D4A] tracking-wider shrink-0">
                            {order.code}
                          </span>
                          <span className="text-xs font-medium text-slate-900 dark:text-white truncate">
                            {order.customerName}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                            {formatItemsCount(order.items.length)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <CurrencyValue
                            value={order.total}
                            size="xs"
                            className="font-mono font-bold text-slate-800 dark:text-slate-200"
                          />
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              order.status === 'preparing'
                                ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                                : order.status === 'ready'
                                  ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-sky-500/20 text-sky-800 dark:text-sky-300'
                            }`}
                          >
                            {order.status.toUpperCase()}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Menu Items */}
              {filteredMenu.length > 0 && (
                <div>
                  <p className="text-[11px] font-['Barlow_Condensed'] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <Utensils size={13} />
                    <span>Cardápio</span>
                  </p>
                  <div className="space-y-1.5">
                    {filteredMenu.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onNavigateToModule('menu');
                          onClose();
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-black/5 dark:border-white/10 transition-all text-left"
                      >
                        <div className="min-w-0 pr-3">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                            {item.description}
                          </p>
                        </div>
                        <CurrencyValue
                          value={item.price}
                          size="xs"
                          className="font-mono font-bold text-slate-900 dark:text-white shrink-0"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Customers */}
              {filteredCustomers.length > 0 && (
                <div>
                  <p className="text-[11px] font-['Barlow_Condensed'] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <Users size={13} />
                    <span>Clientes</span>
                  </p>
                  <div className="space-y-1.5">
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          onNavigateToModule('customers');
                          onClose();
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-black/5 dark:border-white/10 transition-all text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {customer.name}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            {customer.phone} · {formatOrdersCount(customer.ordersCount)}{' '}
                            {customer.ordersCount === 1 ? 'realizado' : 'realizados'}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 shrink-0">
                          {customer.status.toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
