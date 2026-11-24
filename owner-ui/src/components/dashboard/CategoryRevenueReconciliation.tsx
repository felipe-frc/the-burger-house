import type { CategoryRevenueReport } from '../../services/ownerFinance';
import { formatOwnerMoney } from '../../services/ownerPresentation';

export function CategoryRevenueReconciliation({ report }: { report: CategoryRevenueReport }) {
  const total = report.categories.reduce((sum, row) => sum + row.revenue, report.unclassifiedRevenue);
  return <details className="owner-category-reconciliation">
    <summary className="owner-button w-fit cursor-pointer">Ver conciliação</summary>
    <dl>
      <div><dt>Receita bruta no Financeiro</dt><dd>{formatOwnerMoney(report.grossRevenue)}</dd></div>
      <div><dt>Faturamento de produtos</dt><dd>{formatOwnerMoney(total)}</dd></div>
      <div><dt>Frete identificado</dt><dd>{formatOwnerMoney(report.deliveryFees)}</dd></div>
      <div><dt>Pagamentos sem composição confirmada</dt><dd>{formatOwnerMoney(report.unallocatedPayments)}</dd></div>
      <div><dt>Estornos registrados no período</dt><dd>{formatOwnerMoney(report.refundedAmount)}</dd></div>
    </dl>
    <p className="owner-muted">Os estornos são registrados por pagamento e ficam fora das fatias de receita bruta.</p>
  </details>;
}
