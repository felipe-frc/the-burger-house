import { memo, useId } from 'react';
import { Pie, PieChart, Sector, Tooltip, type PieSectorShapeProps, type TooltipContentProps } from 'recharts';
import { grossRevenueShare, type CategoryRevenueReport } from '../../services/ownerFinance';
import { formatOwnerMoney, formatOwnerPercentage } from '../../services/ownerPresentation';

const styles = [
  { key: 'menu', label: 'Hambúrgueres', from: '#82B5FF', to: '#2864F0' },
  { key: 'drinks', label: 'Bebidas', from: '#FF9988', to: '#E85D4A' },
  { key: 'sides', label: 'Acompanhamentos', from: '#FFE98B', to: '#F0BA18' },
  { key: 'unclassified', label: 'Sem categoria histórica', from: 'var(--owner-category-neutral-light)', to: 'var(--owner-category-neutral-dark)' },
];

function RevenueSector({ isActive, ...props }: PieSectorShapeProps) {
  return <Sector {...props} stroke={isActive ? 'var(--owner-fg)' : 'var(--owner-surface)'} strokeWidth={isActive ? 1.5 : 1} />;
}

function RevenueTooltip({ active, payload, total }: TooltipContentProps & { total: number }) {
  const entry = payload[0];
  if (!active || !entry || typeof entry.value !== 'number') return null;
  return <div className="owner-revenue-tooltip" role="status">
    <strong>{entry.name}</strong>
    <span>{formatOwnerMoney(entry.value)} · {formatOwnerPercentage(grossRevenueShare(entry.value, total))}</span>
  </div>;
}

export const CategoryRevenueDonut = memo(function CategoryRevenueDonut({ report }: { report: CategoryRevenueReport }) {
  const id = useId();
  const revenues = new Map(report.categories.map(row => [row.category, row.revenue]));
  const rows = styles.map(({ key, label, from, to }) => ({
    key, label, from, to, gradient: `${id}-${key}`, fill: `url(#${id}-${key})`,
    revenue: (key === 'unclassified' ? report.unclassifiedRevenue : revenues.get(key)) ?? 0,
  })).filter(row => row.revenue > 0);
  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  const hasClassifiedSales = rows.some(row => row.key !== 'unclassified');

  return <>
    {hasClassifiedSales ? <div className="owner-category-data">
      <div className="owner-category-visual">
        <PieChart responsive width="100%" height={168} data={rows} accessibilityLayer
          title="Participação no faturamento por categoria"
          desc="Use as setas para percorrer as categorias. Os valores também estão na legenda."
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>{rows.map(row => <linearGradient key={row.key} id={row.gradient} x2="65%" y2="100%">
            <stop offset="0%" stopColor={row.from} /><stop offset="100%" stopColor={row.to} />
          </linearGradient>)}</defs>
          <Pie data={rows} dataKey="revenue" nameKey="label" innerRadius="66%" outerRadius="92%"
            paddingAngle={2} cornerRadius={3} startAngle={90} endAngle={-270} shape={RevenueSector}
            isAnimationActive="auto" animationDuration={360} animationEasing="ease-out" />
          <Tooltip isAnimationActive="auto" content={props => <RevenueTooltip {...props} total={total} />} />
        </PieChart>
        <div className="owner-category-total">
          <span className="owner-muted">Total em produtos</span>
          <strong>{formatOwnerMoney(total)}</strong>
        </div>
      </div>
      <ul className="owner-category-legend" aria-label="Valores por categoria">
        {rows.map(row => <li key={row.key}>
          <span className="owner-category-swatch" aria-hidden="true" style={{ backgroundImage: `linear-gradient(140deg, ${row.from}, ${row.to})` }} />
          <div><span>{row.label}</span><strong>
            {formatOwnerMoney(row.revenue)} <span className="owner-muted">· {formatOwnerPercentage(grossRevenueShare(row.revenue, total))}</span>
          </strong></div>
        </li>)}
      </ul>
    </div> : <p className="owner-muted owner-chart-empty">
      {report.unclassifiedRevenue > 0 ? <span>Vendas sem categoria histórica · <strong>{formatOwnerMoney(report.unclassifiedRevenue)}</strong></span> :
        report.unallocatedPayments > 0 ? 'O período tem pagamentos sem composição de produtos confirmada.' : 'Sem faturamento de produtos no período.'}
    </p>}
  </>;
});
