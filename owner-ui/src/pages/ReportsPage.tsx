import { useState } from 'react';
import { Download, Truck } from 'lucide-react';
import { FinancePeriodFilter } from '../components/common/FinancePeriodFilter';
import { RevenueSeries } from '../components/dashboard/RevenueSeries';
import { CategoryRevenuePanel } from '../components/dashboard/CategoryRevenuePanel';
import { OrderMovementPanel } from '../components/dashboard/OrderMovementPanel';
import { useOwnerChannelSummary, useOwnerFinanceReport } from '../services/useOwnerFinance';
import { grossRevenueShare, revenueCsv, type FinanceDates, type FinancePeriod } from '../services/ownerFinance';
import { downloadOwnerCsv } from '../services/ownerCsv';
import { formatOwnerMoney, formatOwnerPercentage } from '../services/ownerPresentation';
import { showcaseEnabled } from '../services/ownerShowcase';

interface Props {
  channel?: string; channelsSupported: boolean; hasShift?: boolean; ordersRevision: number;
  onOpenFinance: (period: FinancePeriod, dates?: FinanceDates) => void;
  onNotifyToast: (title: string, description?: string, variant?: 'info' | 'success' | 'warning') => void;
}

type Share = { key: string; label: string; value: number; percentage: number; count: number };

function ShareChart({ rows }: { rows: Share[] }) {
  return <ul className="owner-share-chart">
    {rows.map((row, index) => <li className="owner-share-row" key={row.key} data-tone={index % 3}>
      <div className="owner-share-label"><span aria-hidden="true" /> <strong>{row.label}</strong></div>
      <span className="owner-muted owner-share-count">{row.count} {row.count === 1 ? 'pagamento' : 'pagamentos'}</span>
      <div className="owner-share-values"><strong>{formatOwnerMoney(row.value)}</strong><span>{formatOwnerPercentage(row.percentage)}</span></div>
      <div className="owner-share-track" aria-hidden="true"><div style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%` }} /></div>
    </li>)}
  </ul>;
}

export function ReportsPage({ channel, channelsSupported, hasShift, ordersRevision, onOpenFinance, onNotifyToast }: Props) {
  const [period, setPeriod] = useState<FinancePeriod>('today');
  const [dates, setDates] = useState<FinanceDates>();
  const { data, error, retry } = useOwnerFinanceReport(period, dates, channel, ordersRevision);
  const compareChannels = !channel && channelsSupported;
  const delivery = useOwnerChannelSummary(period, 'delivery', ordersRevision, dates, compareChannels);
  const pickup = useOwnerChannelSummary(period, 'pickup', ordersRevision, dates, compareChannels);
  const hourly = data?.revenue.some(point => point.date.includes('T'));
  const channelRows = data && delivery.data && pickup.data ? [
    { key: 'delivery', label: 'Delivery', value: delivery.data.grossRevenue, count: delivery.data.paidOrders },
    { key: 'pickup', label: 'Balcão', value: pickup.data.grossRevenue, count: pickup.data.paidOrders },
  ].map(row => ({ ...row, percentage: grossRevenueShare(row.value, data.summary.grossRevenue) })) : [];
  return <div className="space-y-4">
    <header className="owner-panel p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="owner-title">Relatórios</h1><p className="owner-muted">Evolução de vendas, categorias, canais e movimento</p></div>
        <button className="owner-button owner-primary" disabled={!data?.revenue.length} onClick={() => {
          if (!data) return;
          downloadOwnerCsv(`the-burger-house-relatorio-${period}.csv`, revenueCsv(data.revenue));
          onNotifyToast('Relatório exportado', undefined, 'success');
        }}><Download size={16} aria-hidden="true"/> Exportar CSV</button>
      </div>
      <FinancePeriodFilter period={period} dates={dates} hasShift={hasShift} onChange={(next, range) => { setPeriod(next); setDates(range); }} />
    </header>
    {error ? <p role="alert" className="owner-panel p-4">{error} <button className="owner-button" onClick={retry}>Tentar novamente</button></p>
      : !data ? <p role="status" className="owner-panel p-4">Carregando relatório…</p> : <>
      <section className="owner-panel p-5 space-y-3">
        <h2 className="owner-heading">Receita bruta por data</h2>
        <p className="owner-muted">{hourly ? 'Distribuição por hora · ' : ''}{data.summary.paidOrders} pagamentos aprovados · {channel === 'delivery' ? 'Entrega' : channel === 'pickup' ? 'Retirada' : 'Todos os canais'}</p>
        <RevenueSeries points={data.revenue} emptyLabel={period === 'today' ? 'Sem vendas ainda hoje.' : 'Sem vendas no período.'} />
      </section>
      <div className={`grid gap-4 ${compareChannels ? 'xl:grid-cols-2' : ''}`}>
        {compareChannels && <section className="owner-panel p-5 space-y-3">
          <h2 className="owner-heading flex items-center gap-2"><Truck size={18} aria-hidden="true" /> Vendas por canal</h2>
          {delivery.error || pickup.error ? <p role="alert">Canais indisponíveis. <button className="owner-button" onClick={() => { delivery.retry(); pickup.retry(); }}>Tentar novamente</button></p>
            : !channelRows.length ? <p role="status">Carregando canais…</p>
            : channelRows.every(row => row.count === 0) ? <p>Sem vendas aprovadas por canal no período.</p>
            : <><p className="owner-muted">Participação na receita bruta do período</p><ShareChart rows={channelRows} /></>}
        </section>}
      </div>
    </>}
    <CategoryRevenuePanel period={period} dates={dates} channel={channel} revision={ordersRevision}
      detail onOpenFinance={onOpenFinance} />
    <OrderMovementPanel channel={channel} revision={ordersRevision} showcase={showcaseEnabled()} />
  </div>;
}
