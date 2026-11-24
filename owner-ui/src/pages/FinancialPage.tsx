import { useState } from 'react';
import { ArrowRight, BadgeDollarSign, CreditCard, Download, QrCode, Receipt, Undo2, Wallet } from 'lucide-react';
import { FinancePeriodFilter } from '../components/common/FinancePeriodFilter';
import { auditActionLabel, auditEntityLabel } from '../components/layout/AuditTrailModal';
import { useOwnerCategoryRevenue, useOwnerFinance, useOwnerFinanceAudit } from '../services/useOwnerFinance';
import { CategoryRevenueReconciliation } from '../components/dashboard/CategoryRevenueReconciliation';
import { PaymentMethodBreakdown } from '../components/dashboard/PaymentMethodBreakdown';
import { showcaseEnabled } from '../services/ownerShowcase';
import { loadOrderDetail } from '../services/ownerOrders';
import { csvText, downloadOwnerCsv } from '../services/ownerCsv';
import { formatOwnerDateTime, formatOwnerMoney, formatPayment } from '../services/ownerPresentation';
import type { FinanceDates, FinancePeriod } from '../services/ownerFinance';
import type { Order } from '../types';

interface Props {
  initialPeriod?: FinancePeriod;
  initialDates?: FinanceDates;
  channel?: string;
  hasShift?: boolean;
  ordersRevision?: number;
  onOpenOrder: (order: Order) => void;
  onNotifyToast: (title: string, description?: string, variant?: 'info' | 'success' | 'warning') => void;
}

export function FinancialPage({ channel, hasShift, ordersRevision = 0, initialPeriod = 'today', initialDates, onOpenOrder, onNotifyToast }: Props) {
  const [period, setPeriod] = useState<FinancePeriod>(initialPeriod);
  const [dates, setDates] = useState<FinanceDates | undefined>(initialDates);
  const [pagination, setPagination] = useState({ channel, page: 1 });
  const page = pagination.channel === channel ? pagination.page : 1;
  const setPage = (value: number) => setPagination({ channel, page: value });
  const { data, error, retry } = useOwnerFinance(period, page, dates, channel, ordersRevision);
  const audit = useOwnerFinanceAudit(period, 1, dates, ordersRevision);
  const showcase = showcaseEnabled();
  const categories = useOwnerCategoryRevenue(period, ordersRevision, channel, !showcase, dates);
  const summary = data?.summary;
  const transactions = data?.transactions;
  const open = async (orderId: number) => {
    try { onOpenOrder(await loadOrderDetail(String(orderId))); }
    catch (cause) { onNotifyToast('Pedido indisponível', cause instanceof Error ? cause.message : 'Tente novamente.', 'warning'); }
  };
  const exportPage = () => {
    if (!transactions) return;
    const rows = transactions.items.map(row => [
      '#' + row.orderId, csvText(formatOwnerDateTime(row.date)), csvText(row.customerName), formatPayment(row.method),
      formatPayment(row.status), row.amount.toFixed(2).replace('.', ','),
    ].join(';'));
    downloadOwnerCsv(`the-burger-house-extrato-${period}-pagina-${page}.csv`,
      ['Pedido;Horário;Cliente;Método;Status;Valor', ...rows].join('\r\n'));
    onNotifyToast('Extrato da página exportado', undefined, 'success');
  };
  return <div className="space-y-4">
    <header className="owner-panel p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="owner-title">Financeiro</h1>
          <p className="owner-muted">Recebimentos, estornos e conciliação · {channel === 'delivery' ? 'Entrega' : channel === 'pickup' ? 'Retirada' : 'Todos os canais'}</p></div>
        <button className="owner-button owner-primary" disabled={!transactions?.items.length} onClick={exportPage}><Download size={16} aria-hidden="true"/> Exportar CSV</button>
      </div>
      <FinancePeriodFilter period={period} dates={dates} hasShift={hasShift} onChange={(next, range) => { setPeriod(next); setDates(range); setPage(1); }} />
    </header>
    {error && <p role="alert" className="owner-panel p-4">{error} <button className="owner-button" onClick={retry}>Tentar novamente</button></p>}
    {!data && !error && <p role="status" className="owner-panel p-4">Carregando financeiro…</p>}
    {summary && transactions && <>
      <div className="owner-kpi-grid owner-finance-kpis">
        {[
          { label: 'Receita confirmada', value: summary.grossRevenue, help: `${summary.paidOrders} pagamentos aprovados`, icon: Wallet, tone: 'blue' },
          { label: 'Estornos', value: summary.refundedAmount, help: 'Registrados no período', icon: Undo2, tone: 'coral' },
          { label: 'Receita líquida', value: summary.netRevenue, help: 'Receita bruta menos estornos', icon: BadgeDollarSign, tone: 'teal' },
          { label: 'Ticket médio', value: summary.averageTicket, help: 'Por pagamento aprovado', icon: Receipt, tone: 'blue' },
          ...(summary.grossProfit != null && summary.ordersWithCost > 0 ?
            [{ label: 'Lucro bruto', value: summary.grossProfit, help: `${summary.ordersWithCost} pedidos com custo completo`, icon: BadgeDollarSign, tone: 'teal' }] : []),
        ].map(({ label, value, help, icon: Icon, tone }) => <section className="owner-panel owner-kpi-hero" key={label}>
          <div className="owner-kpi-caption"><span className="owner-metric-icon" data-tone={tone}><Icon size={16} aria-hidden="true" /></span><h2 className="owner-label">{label}</h2></div>
          <p className="owner-display">{formatOwnerMoney(value)}</p><p className="owner-muted text-xs">{help}</p>
        </section>)}
      </div>
      <PaymentMethodBreakdown methods={data.methods} />
      <section className="owner-panel p-4 space-y-3" aria-label="Conciliação de produtos e pagamentos">
        <h2 className="owner-heading">Conciliação de produtos e pagamentos</h2>
        {showcase ? <p className="owner-muted">Disponível na sessão conectada à API financeira.</p>
          : categories.error ? <p role="alert">{categories.error} <button className="owner-button" onClick={categories.retry}>Tentar novamente</button></p>
          : !categories.data ? <p role="status">Carregando conciliação…</p>
          : <CategoryRevenueReconciliation report={categories.data} />}
      </section>
      <section className="owner-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="owner-heading">Lançamentos do período</h2>
          <p className="owner-muted">Página {page} · {transactions.items.length} de {transactions.total} lançamentos</p>
        </div>
        {transactions.items.length === 0 ? <p>Nenhum lançamento neste período.</p> : <div className="owner-table-shell">
          <table className="owner-table"><caption className="sr-only">Lançamentos do financeiro</caption><thead><tr>
            <th scope="col">Pedido</th><th scope="col">Horário</th><th scope="col">Cliente</th><th scope="col">Método</th>
            <th scope="col">Pagamento</th><th scope="col" className="text-right">Valor</th><th scope="col">Detalhes</th>
          </tr></thead><tbody>{transactions.items.map((row, index) => <tr key={`${row.orderId}-${row.date}-${index}`}>
            <th scope="row">#{row.orderId}</th><td>{formatOwnerDateTime(row.date)}</td><td>{row.customerName || 'Balcão'}</td>
            <td><span className="inline-flex gap-1 items-center">{row.method === 'Pix' ? <QrCode size={16} aria-hidden="true"/> : <CreditCard size={16} aria-hidden="true"/>}{formatPayment(row.method)}</span></td>
            <td><span className="owner-status" data-tone={['Approved', 'PAID'].includes(row.status) ? 'teal' : 'slate'}>{formatPayment(row.status)}</span></td>
            <td className="text-right tabular-nums">{formatOwnerMoney(row.amount)}</td>
            <td><button type="button" className="owner-icon-button" aria-label={`Ver pedido #${row.orderId}`} onClick={() => void open(row.orderId)}><ArrowRight size={16} aria-hidden="true"/></button></td>
          </tr>)}</tbody></table>
        </div>}
        <nav aria-label="Páginas de transações" className="owner-pagination">
          <button className="owner-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <button className="owner-button" disabled={page * transactions.pageSize >= transactions.total} onClick={() => setPage(page + 1)}>Próxima</button>
        </nav>
      </section>
      <details className="owner-panel p-4 space-y-3">
        <summary className="owner-button w-fit cursor-pointer">Detalhes da conciliação</summary>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt>Aprovações com data estimada</dt><dd>{summary.estimatedApprovals}</dd></div>
          <div><dt>Pagamentos sem data de aprovação</dt><dd>{summary.unknownApprovalPayments}</dd></div>
          <div><dt>Pagamentos sem histórico completo de estorno</dt><dd>{summary.unreconstructedRefundPayments}</dd></div>
          <div><dt>Saldo de estornos sem data</dt><dd>{formatOwnerMoney(summary.undatedRefundBalance)}</dd></div>
        </dl><p className="owner-muted">Os valores sem data ficam fora dos totais por período.</p>
      </details>
    </>}
    <section className="owner-panel p-4 space-y-2">
      <h2 className="owner-heading">Auditoria financeira</h2>
      {channel && <p className="owner-muted">Registros da auditoria abrangem todos os canais.</p>}
      {audit.error ? <p role="alert">Auditoria indisponível. {audit.error} <button className="owner-button" onClick={audit.retry}>Tentar novamente</button></p>
        : !audit.data ? <p role="status">Carregando auditoria…</p> : !audit.data.length ? <p>Sem registros no período.</p>
        : <ul className="space-y-2">{audit.data.map((entry, index) => <li key={index} className="border-b border-current/10 py-2">
          <strong>{auditActionLabel(entry.action)}</strong> · {auditEntityLabel(entry.entityType)} {entry.entityType === 'Order' ? '#' : ''}{entry.entityId}
          <div className="owner-muted">{formatOwnerDateTime(entry.createdAtUtc)} · {entry.actor}</div>
        </li>)}</ul>}
    </section>
  </div>;
}
