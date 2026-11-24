import React, { useEffect, useRef } from 'react';
import { X, CheckCheck, Bell, ShoppingBag, Flame, AlertTriangle, CreditCard, Trash2 } from 'lucide-react';
import { NotificationItem } from '../../types';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  writing: boolean;
  error: string;
  hasMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismissNotification: (id: string) => void;
  onUndoArchive: (id: string) => void;
  pendingArchives: ReadonlySet<string>;
  alerts: { type: 'stock' | 'kitchen'; count: number; onOpen: () => void }[];
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications, unreadCount, loading, writing, error, hasMore, onRetry, onLoadMore,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismissNotification,
  onUndoArchive,
  pendingArchives,
  alerts,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const timer = window.setTimeout(() => {
      drawerRef.current?.focus();
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const buttons = drawerRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const focused = document.activeElement;
        if (e.shiftKey && (focused === first || focused === drawerRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && focused === last) {
          e.preventDefault();
          first.focus();
        }
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


  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'order':
        return <ShoppingBag size={14} className="text-sky-600 dark:text-sky-400" />;
      case 'kitchen':
        return <Flame size={14} className="text-amber-600 dark:text-amber-400" />;
      case 'stock':
        return <AlertTriangle size={14} className="text-rose-600 dark:text-rose-400" />;
      case 'payment':
        return <CreditCard size={14} className="text-emerald-600 dark:text-emerald-400" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 dark:bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-drawer-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="owner-notification-drawer w-full owner-dialog-surface p-5 flex flex-col justify-between relative overflow-hidden focus:outline-none"
      >

        <div className="flex flex-col min-h-0 flex-1">
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-900/10 dark:border-white/10 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Bell size={18} className="text-[#E85D4A] shrink-0" />
              <h2
                id="notifications-drawer-title"
                className="font-['Anton'] text-lg uppercase tracking-wide text-slate-900 dark:text-white truncate"
              >
                Notificações
              </h2>
              {unreadCount > 0 && (
                <span className="owner-status" data-tone="teal">
                  {unreadCount} {unreadCount === 1 ? 'nova' : 'novas'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar central de notificações"
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {alerts.some(alert => alert.count) && <section className="space-y-2 py-2" aria-label="Alertas da operação">
            {alerts.filter(alert => alert.count).map(alert => <button key={alert.type} className="owner-button w-full justify-start"
              onClick={alert.onOpen}>{getIcon(alert.type)} {alert.type === 'stock'
                ? `Estoque abaixo do mínimo · ${alert.count}` : `Atrasos na cozinha · ${alert.count}`}</button>)}
          </section>}
          {notifications.length > 0 && <h3 className="owner-label mt-2">Pagamentos confirmados</h3>}
          {/* Quick Action: Mark all read */}
          {unreadCount > 0 && (
            <div className="py-2.5 flex justify-end shrink-0">
              <button
                type="button"
                disabled={writing} onClick={onMarkAllAsRead}
                className="owner-button"
              >
                <CheckCheck size={14} />
                <span>Marcar todas como lidas</span>
              </button>
            </div>
          )}

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-slate-900/10 dark:divide-white/10 pr-1 mt-1">
            {notifications.length === 0 ? (error ? null :
              <div className="py-16 text-center text-slate-500 dark:text-slate-400">
                <Bell size={34} className="mx-auto mb-2.5 opacity-35" />
                <p className="text-sm font-['Barlow_Condensed'] uppercase tracking-wider font-semibold">
{loading ? 'Consultando notificações…' : 'Nenhuma notificação no momento'}
                </p>
                <p className="owner-muted text-xs mt-1">
                  Os pagamentos confirmados aparecem aqui.
                </p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`py-3 px-2.5 rounded-2xl my-1 transition-all ${
                    !item.read
                      ? 'bg-white dark:bg-slate-800 border border-white/80 dark:border-white/15'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      disabled={writing} onClick={() => onMarkAsRead(item.id)}
                      className="flex items-start gap-2.5 text-left flex-1 min-w-0 rounded-lg"
                    >
                      <div className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-black/5 dark:border-white/10 shrink-0 mt-0.5">
                        {getIcon(item.type)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {!item.read && (
                            <span
                              aria-label="Não lida"
                              className="w-1.5 h-1.5 rounded-full bg-[#E85D4A] shrink-0"
                            />
                          )}
                          <h3 className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate">
                            {item.title}
                          </h3>
                        </div>
                        <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                          {item.description}
                        </p>
                      </div>
                    </button>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-xs owner-muted tabular-nums">
                        {item.time}
                      </span>
                      {pendingArchives.has(item.id) ? <button type="button" className="owner-button" onClick={() => onUndoArchive(item.id)}>Desfazer</button> : <button
                        type="button"
                        disabled={writing} onClick={() => onDismissNotification(item.id)}
                        aria-label={`Dispensar notificação: ${item.title}`}
                        title="Dispensar"
                        className="owner-icon-button"
                      >
                        <Trash2 size={12} />
                      </button>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {error && <p role="alert" className="py-2 text-sm">
          {error} <button className="underline" type="button" onClick={onRetry}>Tentar novamente</button>
        </p>}
        {hasMore && <button type="button" className="py-3 text-sm font-semibold underline" disabled={loading}
          onClick={onLoadMore}>Carregar mais notificações</button>}
      </div>
    </div>
  );
};
