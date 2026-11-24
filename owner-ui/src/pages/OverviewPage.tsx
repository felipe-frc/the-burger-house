import { ArrowRight as ArrowRightIcon, ListOrdered as ListNumbersIcon, Flame as FireIcon, Package as PackageIcon, Bike as MotorcycleIcon, BadgeCheck as SealCheckIcon, TriangleAlert as WarningIcon, Clock3 as ClockCountdownIcon, ShieldCheck as ShieldCheckIcon } from 'lucide-react';
type Icon = typeof ListNumbersIcon;
import { useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { KpiMetricsRow } from '../components/dashboard/KpiMetricsRow';
import { useOwnerPendingPayment } from '../services/useOwnerPendingPayment';
import { pendingPaymentAppearance } from '../services/ownerOverviewAppearance';
import { OverviewGreeting } from '../components/dashboard/OverviewGreeting';
import { OrderStatusBadge } from '../components/common/OrderStatusBadge';
import { RevenueSeries } from '../components/dashboard/RevenueSeries';
import { RevenueBarChart } from '../components/dashboard/RevenueBarChart';
import { CategoryRevenuePanel } from '../components/dashboard/CategoryRevenuePanel';
import { useOwnerChannelSummary, useOwnerFinanceRevenue } from '../services/useOwnerFinance';
import { summarizeQueues, type useOwnerDashboard } from '../services/useOwnerDashboard';
import { formatOwnerTime, isActiveStatus, utcInstant } from '../services/ownerPresentation';
import { hasSingleRevenueDay, kitchenTimingSummary } from '../services/ownerOverview';
import type { OperationSettingsDto } from '../services/ownerSettings';
import { SalesPeriodSelector, type SalesPeriod } from '../components/dashboard/SalesPeriodSelector';
import { ownerNow } from '../services/ownerShowcase';
import { isLowStock, type StockRecord } from '../services/ownerStock';
import type { FinanceDates, FinancePeriod } from '../services/ownerFinance';
import type { Order } from '../types';
import type { NavModule } from '../components/layout/Sidebar';

interface OverviewProps {
  orders: Order[];
  ordersLoading: boolean;
  ordersError: string;
  ordersRevision: number;
  onRetryOrders: () => void;
  stock: StockRecord[];
  stockUnavailable: boolean;
  operationalLimits: OperationSettingsDto['limits'];
  operationalLimitsError: boolean;
  operationalLimitsAvailable: boolean;
  activeChannelFilter: string;
  live: ReturnType<typeof useOwnerDashboard>;
  headerContent: ReactNode;
  onNavigateToModule: (module: NavModule) => void;
  onOpenOrders: (status?: string) => void;
  onOpenFinance: (period: FinancePeriod, dates?: FinanceDates) => void;
  onOpenOrder: (order: Order) => void;
}

const todayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' });
const inChannel = (order: Order, channel: string) => channel === 'all' || order.deliveryType === channel;
export function OverviewPage({ orders, ordersLoading, ordersError, ordersRevision, onRetryOrders, stock, stockUnavailable,
  operationalLimits, operationalLimitsError, operationalLimitsAvailable, activeChannelFilter, live, headerContent, onNavigateToModule, onOpenOrders, onOpenFinance, onOpenOrder }: OverviewProps) {
  const [period, setPeriod] = useState<SalesPeriod>('7d');
  const supportsChannels = live.data?.dashboard.orderCounts !== undefined;
  const channel = supportsChannels ? (activeChannelFilter === 'DELIVERY' ? 'delivery' : activeChannelFilter === 'TAKEOUT' ? 'pickup' : undefined) : undefined;
  const revenue = useOwnerFinanceRevenue(period, ordersRevision, channel);
  const selectedDay = useOwnerChannelSummary('today', channel, ordersRevision);
  const pendingCount = live.data && !live.error ? summarizeQueues(live.data.rows, channel).counts.PendingPayment : null;
  const pendingPayment = useOwnerPendingPayment(ordersRevision, channel, pendingCount);
  if (!live.data) return live.error ? <p role="alert" className="owner-panel p-4">{live.error} <button className="owner-button" onClick={live.retry}>Tentar novamente</button></p>
    : <p role="status" className="owner-panel p-4">Carregando indicadores…</p>;

  const today = channel ? selectedDay.data : live.data.dashboard.today;
  const { counts } = summarizeQueues(live.data.rows, channel);
  const scopedOrders = orders.filter(order => inChannel(order, activeChannelFilter));
  const kitchen = kitchenTimingSummary(scopedOrders);
  const stalePayments = scopedOrders.filter(order => order.isStalePayment);
  const stockLow = stock.filter(isLowStock);
  const queueUnavailable = !!ordersError || ordersLoading;
  const hasAlerts = kitchen.delayed > 0 || stalePayments.length > 0 || stockLow.length > 0;
  const singleDay = period !== 'today' && revenue.data && hasSingleRevenueDay(revenue.data.revenue, period === '7d' ? 7 : 30);
  const recent = orders.filter(order => inChannel(order, activeChannelFilter) &&
    isActiveStatus(order.serverStatus ?? 'Received') &&
    Number.isFinite(utcInstant(order.createdAt)) && todayKey.format(utcInstant(order.createdAt)) === todayKey.format(ownerNow()))
    .sort((a, b) => utcInstant(b.createdAt) - utcInstant(a.createdAt));
  const counter = (label: string, value: number, target: NavModule, Icon: Icon, tone: string) =>
    <li key={label}><button type="button" className="owner-pipeline-stage"
      onClick={() => target === 'orders' ? onOpenOrders('completed') : onNavigateToModule(target)}>
      <span className="owner-metric-icon" data-tone={tone}><Icon size={20} strokeWidth={1.65} aria-hidden="true" /></span>
      <span className="owner-stat-copy"><span>{label}</span><strong className="owner-display">{value}</strong></span>
      <ArrowRightIcon className="owner-pipeline-arrow" size={15} aria-hidden="true" />
    </button></li>;

  return <div className="owner-overview">
    <header className="owner-overview-heading">
      <div className="owner-overview-title-group"><OverviewGreeting /></div>
      <div className="owner-overview-header-controls">{headerContent}</div>
    </header>

    <KpiMetricsRow todayRevenue={today?.grossRevenue ?? null} paidOrdersCount={today?.paidOrders ?? null}
      averageTicket={today?.averageTicket ?? null} pendingPaymentCount={pendingCount}
      pendingAppearance={pendingPaymentAppearance({ count: pendingCount,
        oldestCreatedAt: pendingPayment.data?.oldestCreatedAt ?? null, now: ownerNow(),
        available: !!pendingPayment.data && !pendingPayment.error, limitsAvailable: operationalLimitsAvailable && !operationalLimitsError,
        pendingPaymentAgeHours: operationalLimits.pendingPaymentAgeHours })}
      delayedCount={queueUnavailable || operationalLimitsError || !operationalLimitsAvailable || (kitchen.measured < kitchen.total && kitchen.delayed === 0) ? null : kitchen.delayed}
      meanMinutes={queueUnavailable ? null : kitchen.meanMinutes}
      measuredCount={kitchen.measured} kitchenCount={kitchen.total}
      preparingLimit={operationalLimitsError || !operationalLimitsAvailable ? null : operationalLimits.preparing}
      onOpenFinance={() => onOpenFinance('today')} onOpenPending={() => onOpenOrders('PendingPayment')}
      onOpenKitchen={() => onNavigateToModule('kitchen')} />
    {channel && !today && (selectedDay.error
      ? <p role="alert">{selectedDay.error} <button className="owner-button" onClick={selectedDay.retry}>Tentar novamente</button></p>
      : <p role="status">Carregando indicadores do canal…</p>)}

    <section className="owner-panel owner-overview-pipeline" aria-label="Pipeline operacional">
      <ol>
        {counter('Fila', counts.Received, 'kitchen', ListNumbersIcon, 'blue')}
        {counter('Na chapa', counts.Preparing, 'kitchen', FireIcon, 'amber')}
        {counter('Conferência', counts.ReadyForPickup, 'expedition', PackageIcon, 'teal')}
        {counter('Em rota', counts.OutForDelivery, 'delivery', MotorcycleIcon, 'violet')}
        {counter('Concluído', counts.Completed, 'orders', SealCheckIcon, 'teal')}
      </ol>
      <p className="owner-muted">Todas as datas · canal selecionado · abra uma etapa para agir</p>
    </section>

    <div className="owner-overview-action-row">
      <section className="owner-panel owner-overview-orders p-4 space-y-3" aria-labelledby="overview-orders">
        <div className="owner-overview-heading">
          <h2 id="overview-orders" className="owner-heading">Pedidos ativos de hoje</h2>
          <button className="owner-button" onClick={() => onOpenOrders()}>Ver todos os pedidos</button>
        </div>
        {ordersError ? <p role="alert">{ordersError} <button className="owner-button" onClick={onRetryOrders}>Tentar novamente</button></p>
          : ordersLoading ? <p role="status">Carregando pedidos…</p>
          : !recent.length ? <p className="owner-muted">Nenhum pedido ativo de hoje neste canal.</p>
          : <div className="owner-table-shell owner-overview-orders-scroll" role="region" aria-label="Lista de pedidos ativos de hoje" tabIndex={0}>
            <table className="owner-table">
              <caption className="sr-only">Pedidos ativos mais recentes do dia</caption>
              <thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col">Status</th><th scope="col">Hora</th><th scope="col">Detalhes</th></tr></thead>
              <tbody>{recent.map(order => <tr key={order.id}>
                <th scope="row">{order.code}</th><td>{order.customerName || 'Balcão'}</td><td><OrderStatusBadge order={order}/></td>
                <td>{formatOwnerTime(order.createdAt)}</td><td><button className="owner-icon-button" aria-label={`Detalhes do pedido ${order.code}`} onClick={() => onOpenOrder(order)}><ArrowRight size={16} aria-hidden="true"/></button></td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
      <section className="owner-panel owner-overview-alerts p-4" aria-labelledby="overview-alerts">
        <h2 id="overview-alerts" className="owner-heading">Alertas</h2>
        {queueUnavailable ? <p className="owner-muted">{ordersError ? 'Alertas de pedidos indisponíveis.' : 'Atualizando alertas de pedidos…'}</p> : <>
          {kitchen.delayed > 0 && !operationalLimitsError && <button className="owner-button owner-alert-action" onClick={() => onNavigateToModule('kitchen')}>
            <WarningIcon size={20} strokeWidth={1.65} aria-hidden="true" /><span>Pedidos atrasados na cozinha</span> <strong>{kitchen.delayed}</strong>
          </button>}
          {stalePayments.length > 0 && !operationalLimitsError && <button className="owner-button owner-alert-action" onClick={() => onOpenOrders('PendingPayment')}>
            <ClockCountdownIcon size={20} strokeWidth={1.65} aria-hidden="true" /><span>Pagamento pendente há {operationalLimits.pendingPaymentAgeHours} h ou mais</span> <strong>{stalePayments.length}</strong>
          </button>}
        </>}
        {operationalLimitsError && <button className="owner-button" onClick={() => onNavigateToModule('settings')}>Conferir limites indisponíveis</button>}
        {stockUnavailable ? <button className="owner-button" onClick={() => onNavigateToModule('stock')}>Conferir estoque indisponível</button>
          : stockLow.length > 0 && <button className="owner-button" onClick={() => onNavigateToModule('stock')}>
            <PackageIcon size={20} strokeWidth={1.65} aria-hidden="true" /><span>Estoque abaixo do mínimo</span> <strong>{stockLow.length}</strong>
          </button>}
        {!hasAlerts && !queueUnavailable && !stockUnavailable && !operationalLimitsError &&
          <p className="owner-alert-clear"><ShieldCheckIcon size={20} strokeWidth={1.65} aria-hidden="true" /> Tudo em ordem</p>}
        {hasAlerts && <p className="owner-muted text-xs">Pedidos em aberto carregados · todas as datas</p>}
        <div className="owner-overview-actions">
          <button className="owner-button" onClick={() => onNavigateToModule('menu')}>Pausar item</button>
          <button className="owner-button" onClick={() => onNavigateToModule('reports')}>Exportar relatório</button>
          <button className="owner-button" onClick={() => onOpenFinance(period)}>Ver caixa</button>
        </div>
      </section>
    </div>

    <div className="owner-overview-trend-row">
      <section className="owner-panel owner-overview-sales p-4" aria-labelledby="overview-sales">
        <div className="owner-overview-heading">
          <div><h2 id="overview-sales" className="owner-heading">Evolução de vendas</h2><p className="owner-muted text-xs mt-1">Receita bruta · inclui frete</p></div>
          <SalesPeriodSelector value={period} onChange={setPeriod} />
        </div>
        {revenue.error ? <p role="alert">{revenue.error} <button className="owner-button" onClick={revenue.retry}>Tentar novamente</button></p>
          : !revenue.data ? <p role="status">Carregando vendas…</p>
          : <RevenueSeries chart={RevenueBarChart} points={revenue.data.revenue} emptyLabel={period === 'today' ? 'Sem vendas ainda hoje.' : 'Sem vendas no período.'} />}
        {singleDay && <p className="owner-muted text-xs">Vendas em um único dia. Os demais dias do período não tiveram vendas.</p>}
      </section>
      <CategoryRevenuePanel period={period} channel={channel} revision={ordersRevision} onOpenFinance={onOpenFinance} />
    </div>
  </div>;
}
