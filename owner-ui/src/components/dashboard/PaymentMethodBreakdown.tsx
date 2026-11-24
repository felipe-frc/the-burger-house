import type { MethodSummary } from '../../services/ownerFinance';
import { formatOwnerMoney, formatOwnerPercentage, formatPayment } from '../../services/ownerPresentation';

export function PaymentMethodBreakdown({ methods }: { methods: MethodSummary[] }) {
  return <section className="owner-panel p-4 space-y-3">
    <h2 className="owner-heading">Meios de pagamento</h2>
    <p className="owner-muted">Participação na receita bruta do período selecionado</p>
    {!methods.length ? <p>Sem pagamentos aprovados no período.</p> : <ul className="owner-share-chart">
      {[...methods].sort((a, b) => b.revenue - a.revenue).map((row, index) => <li className="owner-share-row" key={row.method} data-tone={index % 3}>
        <div className="owner-share-label"><span aria-hidden="true" /><strong>{formatPayment(row.method)}</strong></div>
        <span className="owner-muted owner-share-count">{row.count} {row.count === 1 ? 'pagamento' : 'pagamentos'}</span>
        <div className="owner-share-values"><strong>{formatOwnerMoney(row.revenue)}</strong><span>{formatOwnerPercentage(row.percentage)}</span></div>
        <div className="owner-share-track" aria-hidden="true"><div style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%` }} /></div>
      </li>)}
    </ul>}
  </section>;
}
