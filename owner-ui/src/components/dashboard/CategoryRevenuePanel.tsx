import { useId } from 'react';
import { CategoryRevenueDonut } from './CategoryRevenueDonut';
import { useOwnerCategoryRevenue } from '../../services/useOwnerFinance';
import { showcaseEnabled } from '../../services/ownerShowcase';
import { formatOwnerMoney } from '../../services/ownerPresentation';
import type { FinanceDates, FinancePeriod } from '../../services/ownerFinance';

const periods = { today: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias',
  month: 'Mês atual', shift: 'Turno configurado', custom: 'Período personalizado' };

interface Props {
  period: FinancePeriod;
  dates?: FinanceDates;
  channel?: string;
  revision?: number;
  detail?: boolean;
  onOpenFinance: (period: FinancePeriod, dates?: FinanceDates) => void;
}

export function CategoryRevenuePanel({ period, dates, channel, revision = 0, detail = false, onOpenFinance }: Props) {
  const id = useId();
  const showcase = showcaseEnabled();
  const { data, error, retry } = useOwnerCategoryRevenue(period, revision, channel, !showcase, dates);
  return <section className="owner-panel owner-category-panel p-4 space-y-3" aria-labelledby={id}>
    <div>
      <h2 id={id} className="owner-heading">{detail ? 'Histórico de faturamento por categoria' : 'Faturamento por categoria'}</h2>
      <p className="owner-muted text-xs mt-1">{periods[period]} · Receita bruta dos produtos, sem frete</p>
    </div>
    {showcase ? <p className="owner-muted">Modo demonstração ativo. <a className="underline" href="?showcase=0">Abrir sessão conectada à API</a></p>
      : error ? <p role="alert">{error} <button className="owner-button" onClick={retry}>Tentar novamente</button></p>
      : !data ? <p role="status">Carregando faturamento por categoria…</p>
      : <>
        <CategoryRevenueDonut report={data} />
        {detail && <div className="owner-table-shell"><table className="owner-table">
          <caption className="sr-only">Faturamento de produtos no período selecionado</caption>
          <thead><tr><th scope="col">Apuração</th><th scope="col">Valor</th></tr></thead>
          <tbody>
            <tr><th scope="row">Produtos com categoria histórica</th><td>{formatOwnerMoney(data.categories.reduce((sum, row) => sum + row.revenue, 0))}</td></tr>
            <tr><th scope="row">Produtos sem categoria histórica</th><td>{formatOwnerMoney(data.unclassifiedRevenue)}</td></tr>
            <tr><th scope="row">Pagamentos sem composição confirmada</th><td>{formatOwnerMoney(data.unallocatedPayments)}</td></tr>
          </tbody>
        </table></div>}
      </>}
    <button className="owner-button w-fit" onClick={() => onOpenFinance(period, dates)}>Ver conciliação no Financeiro</button>
  </section>;
}
