import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { AdminApiError, getOwnerSession, logoutOwner } from './services/adminHttp';
import { loadCustomers } from './services/ownerCustomers';
import { loadProducts, mapProduct, saveProduct, setProductAvailability, uploadProductImage, deleteProductImage, type ProductDto } from './services/ownerProducts';
import { useNotificationInbox } from './services/useNotificationInbox';
import { isLowStock, loadStock, type StockRecord } from './services/ownerStock';
import { loadModuleOrders, loadOrderDetail, advanceOrder, serverStatus, type OrderRowDto, type DispatchChecklist } from './services/ownerOrders';
import { ownerNow, showcaseEnabled } from './services/ownerShowcase';
import { isActiveStatus, isKitchenOrder, statusKeys, withOperationalTiming } from './services/ownerPresentation';
import { useUndoQueue } from './services/useUndoQueue';
import { loadOperationSettings, type OperationSettingsDto } from './services/ownerSettings';
import { summarizeQueues, useOwnerDashboard } from './services/useOwnerDashboard';
import type { Customer } from './types';
import { Sidebar, NavModule, SidebarCounts } from './components/layout/Sidebar';
import { Navbar } from './components/layout/Navbar';
import { ChannelSelector } from './components/layout/ChannelSelector';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { NotificationDrawer } from './components/layout/NotificationDrawer';
import { ToastContainer, ToastMessage } from './components/common/ToastContainer';
import { OrderDetailModal } from './components/orders/OrderDetailModal';
import { LoginPage } from './pages/LoginPage';

// 12 Administrative Modules
import { OrdersPage } from './pages/OrdersPage';
import { KitchenPage } from './pages/KitchenPage';
import { ExpeditionPage } from './pages/ExpeditionPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { MenuPage } from './pages/MenuPage';
import { CustomersPage } from './pages/CustomersPage';
import { SettingsPage } from './pages/SettingsPage';
import { Order, OrderStatus } from './types';
import type { FinanceDates, FinancePeriod } from './services/ownerFinance';
import { AgendaModal } from './components/agenda/AgendaModal';
import { AuditTrailModal } from './components/layout/AuditTrailModal';

const modulePaths: Record<NavModule, string> = {
  overview: 'dashboard', orders: 'orders', kitchen: 'kitchen', expedition: 'dispatch',
  delivery: 'deliveries', menu: 'products', stock: 'inventory', customers: 'customers',
  financial: 'finance', reports: 'reports', team: 'team', settings: 'settings',
};
type ThemePreference = 'light' | 'dark' | 'system';
const StockPage = lazy(() => import('./pages/StockPage').then(module => ({ default: module.StockPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then(module => ({ default: module.TeamPage })));
const OverviewPage = lazy(() => import('./pages/OverviewPage').then(module => ({ default: module.OverviewPage })));
const FinancialPage = lazy(() => import('./pages/FinancialPage').then(module => ({ default: module.FinancialPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(module => ({ default: module.ReportsPage })));

const themeKey = 'tbh-owner-theme';
function readTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem(themeKey);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch { /* The theme is still usable without local storage. */ }
  return 'system';
}
function readModule(): NavModule {
  const section = window.location.pathname.split('/')[2];
  if (section === 'security' || section === 'store') return 'settings';
  return (Object.keys(modulePaths) as NavModule[]).find(key => modulePaths[key] === section) ?? 'overview';
}
function readOrderId() {
  return /^\/admin\/orders\/([1-9]\d*)\/?$/.exec(window.location.pathname)?.[1];
}

export default function App() {
  const [isDemoEntered, setIsDemoEntered] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [realCustomers, setRealCustomers] = useState<Customer[]>([]);
  const [customerError, setCustomerError] = useState('');
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerRevision, setCustomerRevision] = useState(0);
  const [dataError, setDataError] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [reload, setReload] = useState(0);
  const [realOrders, setRealOrders] = useState<Order[]>([]);

  const [showcaseMode] = useState(showcaseEnabled);
  const [orderRows, setOrderRows] = useState<OrderRowDto[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(ownerNow);
  const [isConnected, setIsConnected] = useState(() => navigator.onLine);
  const [orderSettings, setOrderSettings] = useState<OperationSettingsDto['limits']>({ preparing: 0, readyForPickup: 0, outForDelivery: 0 });
  const [settingsRevision, setSettingsRevision] = useState(0);
  const orderWrites = useRef(new Set<string>());
  const [pendingOrders, setPendingOrders] = useState<ReadonlySet<string>>(new Set());
  const { actions: undoActions, schedule: scheduleUndo, cancel: cancelUndo, clear: clearUndo } = useUndoQueue();
  const interactionDown = useRef(false);
  const deferredQueueCommit = useRef<(() => void) | null>(null);
  const queueRequestActive = useRef(false);
  const [limitError, setLimitError] = useState(false);
  const [limitsReady, setLimitsReady] = useState(false);
  const [productRevision, setProductRevision] = useState(0);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [productError, setProductError] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  useEffect(() => {
    if (!isDemoEntered) { setProducts([]); return; }
    const controller = new AbortController(); setProductsLoading(true); setProductError('');
    loadProducts(controller.signal).then(rows => { if (!controller.signal.aborted) setProducts(rows); }).catch(error => { if (!controller.signal.aborted) setProductError(error.message); }).finally(() => { if (!controller.signal.aborted) setProductsLoading(false); });
    return () => controller.abort();
  }, [isDemoEntered, productRevision]);
  const [currentModule, setModule] = useState<NavModule>(readModule);
  const [financeScope, setFinanceScope] = useState<{ period: FinancePeriod; dates?: FinanceDates }>({ period: 'today' });
  const [routeOrderId, setRouteOrderId] = useState(readOrderId);
  const setCurrentModule = useCallback((module: NavModule) => {
    const url = '/admin/' + modulePaths[module];
    if (window.location.pathname !== url) window.history.pushState(null, '', url);
    setModule(module);
    setRouteOrderId(undefined);
  }, []);
  useEffect(() => {
    const navigate = () => { setModule(readModule()); setRouteOrderId(readOrderId()); };
    window.addEventListener('popstate', navigate);
    return () => window.removeEventListener('popstate', navigate);
  }, []);

  const [orderSearch, setOrderSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState('active');
  const refreshOrders = useCallback(() => setReload(value => value + 1), []);
  const inbox = useNotificationInbox(isDemoEntered, refreshOrders);
  const isCustomersModule = currentModule === 'customers';
  const isOrderQueue = ['orders', 'kitchen', 'expedition', 'delivery'].includes(currentModule);
  const filterStatus = orderFilter === 'PendingPayment' ? orderFilter : serverStatus[orderFilter as OrderStatus] ?? '';
  const isOperationalBoard = ['kitchen', 'expedition', 'delivery'].includes(currentModule);
  const dashboard = useOwnerDashboard(isDemoEntered, reload);
  const supportsOrderFilters = dashboard.data?.dashboard.orderCounts !== undefined;
  const waitingForDashboard = !dashboard.data && !dashboard.error;
  const queueFiltersPending = waitingForDashboard && ['orders', 'delivery', 'overview'].includes(currentModule);
  const queueSupportsFilters = supportsOrderFilters && ['orders', 'delivery', 'overview'].includes(currentModule);
  const [activeChannelFilter, setActiveChannelFilter] = useState('all');
  const channel = activeChannelFilter === 'DELIVERY' ? 'delivery' : activeChannelFilter === 'TAKEOUT' ? 'pickup' : undefined;
  const search = currentModule === 'orders' ? committedSearch : '';
  const requestedStatus = currentModule === 'orders' ? filterStatus : '';
  const activeOnly = currentModule === 'orders' && orderFilter === 'active';
  const [loadedQueueKey, setLoadedQueueKey] = useState('');
  const queueKey = [currentModule, requestedStatus, activeOnly, search, orderPage, queueSupportsFilters, channel].join('|');
  useEffect(() => {
    setLimitsReady(false);
    if (!isDemoEntered) return;
    const controller = new AbortController();
    loadOperationSettings(controller.signal).then(result => {
      if (!controller.signal.aborted) { setOrderSettings(result.limits); setLimitError(false); setLimitsReady(true); }
    }).catch(() => {
      if (!controller.signal.aborted) setLimitError(true);
    });
    return () => controller.abort();
  }, [isDemoEntered, settingsRevision]);
  useEffect(() => {
    const updateConnection = () => {
      setIsConnected(navigator.onLine);
      if (navigator.onLine) refreshOrders();
    };
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    const release = () => {
      interactionDown.current = false;
      const commit = deferredQueueCommit.current;
      deferredQueueCommit.current = null;
      if (commit) window.requestAnimationFrame(commit);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    const timer = window.setInterval(() => setNow(ownerNow()), 1000);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      window.clearInterval(timer);
    };
  }, [refreshOrders]);
  useEffect(() => {
    if (!isDemoEntered || showcaseMode) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine && orderWrites.current.size === 0 &&
          !interactionDown.current && !queueRequestActive.current) refreshOrders();
    }, isOperationalBoard ? 5000 : 15000);
    return () => window.clearInterval(timer);
  }, [isDemoEntered, isOperationalBoard, refreshOrders, showcaseMode]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCommittedSearch(orderSearch.trim());
      setOrderPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [orderSearch]);
  useEffect(() => { setOrderPage(1); }, [currentModule]);
  useEffect(() => {
    if (!isDemoEntered) { setRealCustomers([]); setCustomerError(''); return; }
    if (!isCustomersModule) return;
    const controller = new AbortController();
    setCustomersLoading(true);
    setCustomerError('');
    loadCustomers(controller.signal).then(customers => {
      if (!controller.signal.aborted) setRealCustomers(customers);
    }).catch(error => {
      if (!controller.signal.aborted) setCustomerError(error.message);
    }).finally(() => { if (!controller.signal.aborted) setCustomersLoading(false); });
    return () => controller.abort();
  }, [isDemoEntered, customerRevision, isCustomersModule]);
  useEffect(() => {
    if (!isDemoEntered) {
      setRealOrders([]); setOrderRows([]); setOrderTotal(0); setLoadedQueueKey(''); setLastUpdated(null);
      return;
    }
    if (!(isOrderQueue || currentModule === 'overview') || queueFiltersPending) return;
    const controller = new AbortController();
    const signal = controller.signal;
    queueRequestActive.current = true;
    if (queueKey !== loadedQueueKey) { setLoadingData(true); setDataError(''); }
    loadModuleOrders({ currentModule, queueSupportsFilters, channel, activeOnly, requestedStatus, search, orderPage }, signal).then(result => {
      if (signal.aborted) return;
      const commit = () => {
        if (signal.aborted) return;
        setRealOrders(result.orders);
        setOrderRows(result.rows);
        setOrderTotal(result.total);
        setPageSize(result.pageSize);
        setLoadedQueueKey(queueKey);
        setLastUpdated(Date.now());
        setDataError('');
        if (currentModule === 'orders' && orderPage > 1 && result.total <= (orderPage - 1) * result.pageSize)
          setOrderPage(Math.max(1, Math.ceil(result.total / result.pageSize)));
      };
      if (interactionDown.current) deferredQueueCommit.current = commit;
      else commit();
    }).catch(error => {
      if (!signal.aborted) setDataError(error instanceof Error ? error.message : 'Erro ao carregar pedidos.');
    }).finally(() => {
      if (!signal.aborted) { setLoadingData(false); queueRequestActive.current = false; }
    });
    return () => { controller.abort(); queueRequestActive.current = false; deferredQueueCommit.current = null; };
    // A conclusão da requisição atualiza loadedQueueKey sem iniciar uma nova busca.
  }, [isDemoEntered, reload, queueKey, isOrderQueue, currentModule, orderPage, queueSupportsFilters, channel, activeOnly, requestedStatus, search, queueFiltersPending]);
  useEffect(() => {
    let controller: AbortController | undefined;
    const expire = () => { clearUndo(); setIsDemoEntered(false); };
    const validate = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      getOwnerSession(request.signal).then(session => {
        if (!request.signal.aborted) setIsDemoEntered(session.role === 'Owner');
      }).catch(error => {
        if (!request.signal.aborted && error instanceof AdminApiError && error.status === 401) expire();
      }).finally(() => {
        if (!request.signal.aborted) setCheckingSession(false);
      });
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) validate(); };
    window.addEventListener('owner-session-expired', expire);
    window.addEventListener('online', validate);
    window.addEventListener('pageshow', onPageShow);
    validate();
    return () => {
      controller?.abort();
      window.removeEventListener('owner-session-expired', expire);
      window.removeEventListener('online', validate);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [clearUndo]);
  const [focusLoginOnReturn, setFocusLoginOnReturn] = useState<boolean>(false);
  const [theme, setTheme] = useState(readTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const isDarkMode = theme === 'system' ? systemDark : theme === 'dark';
  const toggleTheme = () => setTheme(isDarkMode ? 'light' : 'dark');
  useEffect(() => {
    const colors = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    colors.addEventListener('change', update);
    return () => colors.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(themeKey, theme); } catch { /* Session-only preference. */ }
  }, [theme]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const closeNotifications = useCallback(() => setIsNotificationsOpen(false), []);
  const [selectedSearchOrder, setSelectedSearchOrder] = useState<Order | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dashboardMainRef = useRef<HTMLElement>(null);

  // Sync dark mode class on document element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Ensure module navigation starts cleanly at top below sticky navbar
  useEffect(() => {
    if (isDemoEntered) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [currentModule, isDemoEntered]);

  // Global Ctrl + K keyboard shortcut (active inside dashboard only)
  useEffect(() => {
    if (!isDemoEntered) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDemoEntered]);

  const notifyToast = useCallback(
    (
      title: string,
      description?: string,
      variant: 'info' | 'success' | 'warning' = 'info'
    ) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!isDemoEntered || !routeOrderId) return;
    const request = new AbortController();
    loadOrderDetail(routeOrderId, request.signal).then(order => {
      if (!request.signal.aborted) setSelectedSearchOrder(order);
    }).catch(error => {
      if (!request.signal.aborted) notifyToast('Pedido indisponível', error.message, 'warning');
    });
    return () => request.abort();
  }, [isDemoEntered, routeOrderId, reload, notifyToast]);

  const orders = useMemo(() => loadedQueueKey === queueKey
    ? realOrders.map(order => withOperationalTiming(order, now, orderSettings)) : [],
    [loadedQueueKey, queueKey, realOrders, now, orderSettings]);
  const menu = useMemo(() => products.map(mapProduct), [products]);
  const [stock, setStock] = useState<StockRecord[]>([]);
  const [stockError, setStockError] = useState('');
  const [stockLoading, setStockLoading] = useState(true);
  const [stockRevision, setStockRevision] = useState(0);
  const reloadStock = () => setStockRevision(value => value + 1);
  useEffect(() => {
    if (!isDemoEntered) {
      setStock([]);
      setStockError('');
      return;
    }
    const request = new AbortController();
    setStockLoading(true);
    setStockError('');
    loadStock(request.signal)
      .then(rows => { if (!request.signal.aborted) setStock(rows); })
      .catch(error => { if (!request.signal.aborted) setStockError(error.message); })
      .finally(() => { if (!request.signal.aborted) setStockLoading(false); });
    return () => request.abort();
  }, [isDemoEntered, stockRevision]);
  const customers = realCustomers;
  const [isAgendaOpen, setIsAgendaOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const openOrderDetail = async (order: Order) => {
    setSelectedSearchOrder(order);
    try {
      const detail = await loadOrderDetail(order.id);
      setSelectedSearchOrder(value => value?.id === order.id ? detail : value);
    } catch (error) {
      notifyToast('Histórico indisponível', error instanceof Error ? error.message : 'Tente novamente.', 'warning');
    }
  };

  const queueSummary = useMemo(() => summarizeQueues(dashboard.data?.rows ?? []), [dashboard.data]);
  const sidebarCounts: SidebarCounts = useMemo(() => ({
    orders: statusKeys.filter(isActiveStatus).reduce((total, status) => total + queueSummary.counts[status], 0),
    kitchen: queueSummary.counts.Received + queueSummary.counts.Preparing,
    expedition: queueSummary.counts.ReadyForPickup,
    delivery: supportsOrderFilters ? queueSummary.delivery : 0,
    lowStock: stock.filter(isLowStock).length,
  }), [queueSummary, stock, supportsOrderFilters]);

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus, checklist?: DispatchChecklist) => {
    if (orderWrites.current.has(orderId)) return false;
    const row = orderRows.find(order => String(order.id) === orderId);
    const selected = selectedSearchOrder?.id === orderId ? selectedSearchOrder : undefined;
    const expectedStatus = row?.status ?? selected?.serverStatus;
    if (!expectedStatus) return false;
    orderWrites.current.add(orderId);
    setPendingOrders(new Set(orderWrites.current));
    try {
      await advanceOrder(orderId, expectedStatus, status, checklist);
      setReload(value => value + 1);
      notifyToast('Pedido atualizado', undefined, 'success');
      return true;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 409) setReload(value => value + 1);
      notifyToast('Pedido não atualizado', error instanceof Error ? error.message : 'Tente novamente.', 'warning');
      return false;
    } finally {
      orderWrites.current.delete(orderId);
      setPendingOrders(new Set(orderWrites.current));
    }
  };
  const deferOrderStatus = (orderId: string, status: OrderStatus) => scheduleUndo(
    'order:' + orderId, `Atualização agendada para o pedido #${orderId}`,
    () => handleUpdateOrderStatus(orderId, status),
  );
  const busyOrders = new Set([...pendingOrders, ...undoActions.filter(action => action.key.startsWith('order:'))
    .map(action => action.key.slice(6))]);

  const handleEnterDemo = useCallback(() => {
    setIsMobileSidebarOpen(false);
    setIsSearchOpen(false);
    setIsNotificationsOpen(false);
    setSelectedSearchOrder(null);
    if (window.location.pathname === '/admin/' || window.location.pathname === '/admin') {
      window.history.replaceState(null, '', '/admin/dashboard');
    }
    setFocusLoginOnReturn(false);
    setIsDemoEntered(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.requestAnimationFrame(() => {
      dashboardMainRef.current?.focus();
    });
  }, []);

  const endSession = useCallback(() => {
    clearUndo();
    setIsMobileSidebarOpen(false);
    setIsSearchOpen(false);
    setIsNotificationsOpen(false);
    setSelectedSearchOrder(null);
    setToasts([]);
    window.history.replaceState(null, '', '/admin/');
    setModule('overview');
    setRouteOrderId(undefined);
    setFocusLoginOnReturn(true);
    setIsDemoEntered(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [clearUndo]);
  const handleLogoutDemo = useCallback(async () => {
    clearUndo();
    if (showcaseMode) {
      window.location.assign('/admin/?showcase=0');
      return;
    }
    try { await logoutOwner(); }
    catch (error) {
      notifyToast('Não foi possível encerrar a sessão', error instanceof Error ? error.message : 'Tente novamente.', 'warning');
      return;
    }
    endSession();
  }, [clearUndo, endSession, notifyToast, showcaseMode]);

  const openFinance = (period: FinancePeriod, dates?: FinanceDates) => {
    setFinanceScope({ period, dates });
    setCurrentModule('financial');
  };
  const mainStatus = <div className="owner-main-status">
    <div className="owner-main-meta">
      {dashboard.data?.dashboard.shift && <span className="owner-status"
        data-tone={dashboard.data.dashboard.shift.isOpen ? 'teal' : 'slate'}
        title="Conforme o horário configurado do turno">
        {dashboard.data.dashboard.shift.isOpen ? 'Loja aberta' : 'Loja fechada'}
      </span>}
      {showcaseMode && <p className="owner-demo-note" role="status">Demonstração · cenário de 17/11/2026</p>}
      {(!isConnected || (isOrderQueue && dataError) || (currentModule === 'overview' && dashboard.error))
        ? <div role="status" className="owner-sync owner-sync-error">{!isConnected ? 'Sem conexão. Reconecte para atualizar.' : 'Atualização pendente. Tentando novamente.'} <button className="owner-button" onClick={refreshOrders}>Atualizar</button></div>
        : lastUpdated && (isOrderQueue || currentModule === 'overview') ? <p className="owner-sync">
          Atualizado há {Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000))} s
        </p> : null}
    </div>
    {(currentModule === 'orders' || currentModule === 'overview' ||
      (supportsOrderFilters && (currentModule === 'financial' || currentModule === 'reports'))) &&
      <ChannelSelector value={activeChannelFilter} onChange={value => { setActiveChannelFilter(value); setOrderPage(1); }} />}
  </div>;

  const renderCurrentModule = () => {
    if (currentModule === 'menu') {
      if (productsLoading) return <p role="status">Carregando produtos…</p>;
      if (productError) return <p role="alert">{productError} <button onClick={() => setProductRevision(value => value + 1)}>Tentar novamente</button></p>;
    }
    if (isOrderQueue && dataError && loadedQueueKey !== queueKey) return <div role="alert">{dataError} <button onClick={refreshOrders}>Tentar novamente</button></div>;
    if (isOrderQueue && (loadingData || (waitingForDashboard && currentModule === 'delivery')) &&
      currentModule !== 'orders') return <p role="status">Carregando pedidos…</p>;
    switch (currentModule) {
      case 'overview':
        return (
          <OverviewPage
            orders={orders}
            ordersLoading={loadingData}
            ordersError={dataError}
            ordersRevision={reload}
            live={dashboard}
            onRetryOrders={refreshOrders}
            stock={stock}
            stockUnavailable={stockLoading || !!stockError}
            operationalLimits={orderSettings}
            operationalLimitsError={limitError}
            operationalLimitsAvailable={limitsReady}
            onOpenOrder={openOrderDetail}
            activeChannelFilter={activeChannelFilter}
            onNavigateToModule={setCurrentModule}
            headerContent={mainStatus}
            onOpenFinance={openFinance}
            onOpenOrders={(status = 'active') => { setOrderFilter(status); setOrderPage(1); setCurrentModule('orders'); }}
          />
        );
      case 'orders':
        return (
          <OrdersPage
            orders={loadingData ? [] : orders}
            loading={loadingData || waitingForDashboard}
            search={orderSearch}
            statusFilter={orderFilter}
            onSearchChange={setOrderSearch}
            onStatusFilterChange={status => { setOrderFilter(status); setOrderPage(1); }}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onOpenOrder={openOrderDetail}
            pendingOrders={busyOrders}
            counts={summarizeQueues(dashboard.data?.rows ?? [], supportsOrderFilters ? channel : undefined).counts}
          />
        );
      case 'kitchen':
        return <KitchenPage orders={orders} pendingOrders={busyOrders} limit={orderSettings.preparing} limitError={limitError}
          onUpdateOrderStatus={deferOrderStatus} />;
      case 'expedition':
        return <ExpeditionPage orders={orders} onUpdateOrderStatus={handleUpdateOrderStatus} />;
      case 'delivery':
        return <DeliveryPage orders={orders} pendingOrders={busyOrders} onUpdateOrderStatus={deferOrderStatus}
          onOpenExpedition={() => setCurrentModule('expedition')} />;
      case 'menu':
        return (
          <MenuPage
            menu={menu}
            onToggleAvailability={async itemId => {
              const original = products.find(product => String(product.id) === itemId); if (!original) return;
              await setProductAvailability(original);
              setProducts(await loadProducts());
              notifyToast(original.isActive ? 'Produto pausado' : 'Produto reativado', undefined, 'success');
            }}
            onSaveMenuItem={async item => {
              await saveProduct(item, products.find(product => String(product.id) === item.id));
              setProducts(await loadProducts());
            }}
            onUploadImage={async (id, file) => { await uploadProductImage(Number(id), file); setProducts(await loadProducts()); }}
            onDeleteImage={async id => { await deleteProductImage(Number(id)); setProducts(await loadProducts()); }}
            onNotifyToast={notifyToast}
          />
        );
      case 'stock':
        return <StockPage items={stock} loading={stockLoading} error={stockError} reload={reloadStock} />;
      case 'team':
        return <TeamPage onNotifyToast={notifyToast} />;
      case 'customers':
        if (customerError) return <div role="alert">{customerError} <button onClick={() => setCustomerRevision(value => value + 1)}>Tentar novamente</button></div>;
        if (customersLoading) return <p role="status">Carregando clientes…</p>;
        return <CustomersPage customers={customers} />;
      case 'financial':
        return (
          <FinancialPage
            key={JSON.stringify(financeScope)}
            ordersRevision={reload}
            initialPeriod={financeScope.period}
            initialDates={financeScope.dates}
            channel={supportsOrderFilters ? channel : undefined}
            hasShift={!!dashboard.data?.dashboard.shift}
            onOpenOrder={order => setSelectedSearchOrder(order)}
            onNotifyToast={notifyToast}
          />
        );
      case 'reports':
        return (
          <ReportsPage
            channel={supportsOrderFilters ? channel : undefined}
            channelsSupported={supportsOrderFilters}
            hasShift={!!dashboard.data?.dashboard.shift}
            ordersRevision={reload}
            onOpenFinance={openFinance}
            onNotifyToast={notifyToast}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            theme={theme}
            onThemeChange={setTheme}
            onSessionEnded={endSession}
            onLimitsSaved={() => { setSettingsRevision(value => value + 1); refreshOrders(); }}
          />
        );
      default:
        return null;
    }
  };

  if (checkingSession) return <div role="status">Verificando sessão…</div>;
  if (!isDemoEntered) {
    return (
      <LoginPage
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleTheme}
        onEnterDemo={handleEnterDemo}
        focusOnMount={focusLoginOnReturn}
      />
    );
  }

  return (
    <div className="owner-shell">
      <Navbar
        modulePaths={modulePaths}
        onToggleSidebar={() => setIsMobileSidebarOpen(true)}
        isSidebarOpen={isMobileSidebarOpen}
        onOpenSearch={() => setIsSearchOpen(true)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleTheme}
        unreadCount={inbox.unread}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenAgenda={() => setIsAgendaOpen(true)}
        onOpenAudit={() => setIsAuditOpen(true)}
        onNavigateToModule={setCurrentModule}
        onLogoutDemo={handleLogoutDemo}
      />
      <Sidebar
        currentModule={currentModule}
        onSelectModule={setCurrentModule}
        counts={sidebarCounts}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(value => !value)}
      />

      <div className="owner-main-frame">
        {/* Operational Viewport */}
        <main
          ref={dashboardMainRef}
          tabIndex={-1}
          onPointerDownCapture={() => { interactionDown.current = true; }}
          className="owner-main outline-none"
        >
          {currentModule !== 'overview' && mainStatus}
          <Suspense fallback={<p role="status" className="p-4">Carregando módulo…</p>}>
            {renderCurrentModule()}
          </Suspense>

          {currentModule === 'orders' && <nav aria-label="Paginação de pedidos" className="owner-pagination">
            <button className="owner-button" disabled={loadingData || orderPage === 1} onClick={() => setOrderPage(value => value - 1)}>Anterior</button>
            <span>Página {orderPage} · {orders.length} de {loadedQueueKey === queueKey ? orderTotal : 0} pedidos</span>
            <button className="owner-button" disabled={loadingData || loadedQueueKey !== queueKey || orderPage * pageSize >= orderTotal} onClick={() => setOrderPage(value => value + 1)}>Próxima</button>
            <button className="owner-button" onClick={refreshOrders}>Atualizar</button>
          </nav>}
        </main>
      </div>

      {/* 3. Global Search Modal (Ctrl + K) */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={closeSearch}
        orders={orders}
        menu={menu}
        customers={customers}
        onNavigateToModule={setCurrentModule}
        onSelectOrder={openOrderDetail}
      />

      {/* 4. Order Detail Modal opened from Global Search */}
      <OrderDetailModal
        order={selectedSearchOrder}
        onClose={() => {
          setSelectedSearchOrder(null);
          if (routeOrderId) setCurrentModule('orders');
        }}
        onUpdateStatus={handleUpdateOrderStatus}
      />

      {/* 5. Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotificationsOpen}
        onClose={closeNotifications}
        notifications={inbox.items}
        unreadCount={inbox.unread}
        loading={inbox.loading}
        writing={inbox.writing}
        error={inbox.error}
        hasMore={inbox.more}
        onRetry={inbox.retry}
        onLoadMore={inbox.loadMore}
        onMarkAsRead={id => inbox.mutate(id + '/read')}
        onMarkAllAsRead={() => inbox.mutate('read')}
        onDismissNotification={id => { void scheduleUndo('notification:' + id, 'Notificação agendada para arquivar', () => inbox.mutate(id + '/archive')); }}
        onUndoArchive={id => cancelUndo('notification:' + id)}
        pendingArchives={new Set(undoActions.filter(action => action.key.startsWith('notification:')).map(action => action.key.slice(13)))}
        alerts={[
          { type: 'stock', count: stock.filter(isLowStock).length, onOpen: () => { closeNotifications(); setCurrentModule('stock'); } },
          { type: 'kitchen', count: ['overview', 'kitchen'].includes(currentModule) ? orders.filter(order => order.isDelayed && isKitchenOrder(order)).length : 0,
            onOpen: () => { closeNotifications(); setCurrentModule('kitchen'); } },
        ]}
      />

      <AgendaModal isOpen={isAgendaOpen} onClose={() => setIsAgendaOpen(false)} />
      <AuditTrailModal isOpen={isAuditOpen} onClose={() => setIsAuditOpen(false)} />
      {undoActions.some(action => action.key.startsWith('order:')) && <section role="status" className="owner-panel fixed z-40 bottom-4 left-4 p-3 space-y-2 max-w-[calc(100vw-2rem)]">
        {undoActions.filter(action => action.key.startsWith('order:')).map(action => <div key={action.key} className="flex items-center gap-3">
          <span>{action.title} · 5 s para desfazer</span><button className="owner-button" onClick={() => cancelUndo(action.key)}>Desfazer</button>
        </div>)}
      </section>}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
