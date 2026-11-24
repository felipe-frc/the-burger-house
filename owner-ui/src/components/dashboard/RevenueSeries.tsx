import type { ComponentType } from 'react';
import { formatOwnerMoney } from '../../services/ownerPresentation';
import type { RevenuePoint } from '../../services/ownerFinance';

function periodLabel(date: string) {
  return date.includes('T') ? date.slice(11, 16) : date.split('-').slice(1).reverse().join('/');
}

function RevenueColumnPlot({ points }: { points: RevenuePoint[] }) {
  const max = Math.max(...points.map(point => point.revenue), 1);
  const unit = Math.pow(10, Math.floor(Math.log10(max)));
  const ceiling = Math.ceil(max / unit) * unit;

  return <div aria-hidden="true" className="owner-revenue-chart">
    <div className="owner-chart-axis"><span>{formatOwnerMoney(ceiling)}</span><span>{formatOwnerMoney(ceiling / 2)}</span><span>R$ 0</span></div>
    <div className="owner-chart-columns">
      {points.map(point => <div key={point.date} className="owner-chart-slot" title={`${periodLabel(point.date)} · ${formatOwnerMoney(point.revenue)}`}>
        <span style={{ height: `${point.revenue / ceiling * 100}%` }} />
      </div>)}
    </div>
    <div className="owner-chart-range"><span>{periodLabel(points[0].date)}</span><span>{periodLabel(points.at(-1)!.date)}</span></div>
  </div>;
}

interface RevenueSeriesProps {
  points: RevenuePoint[];
  emptyLabel: string;
  chart?: ComponentType<{ points: RevenuePoint[] }>;
}

export function RevenueSeries({ points, emptyLabel, chart: Chart = RevenueColumnPlot }: RevenueSeriesProps) {
  const hasData = points.some(point => point.revenue > 0);
  return <div className="space-y-3">
    {hasData ? <Chart points={points} /> : <p className="owner-muted owner-chart-empty">{emptyLabel}</p>}
    {points.length > 0 && <details><summary className="owner-button w-fit cursor-pointer">Ver dados em tabela</summary>
      <div className="owner-table-shell max-h-60"><table className="owner-table">
        <caption className="sr-only">Receita bruta no período</caption><thead><tr><th scope="col">{points[0].date.includes('T') ? 'Hora' : 'Data'}</th><th scope="col" className="text-right">Receita bruta</th></tr></thead>
        <tbody>{points.map(point => <tr key={point.date}><th scope="row">{point.date.includes('T') ? periodLabel(point.date) : point.date.split('-').reverse().join('/')}</th><td className="text-right tabular-nums">{formatOwnerMoney(point.revenue)}</td></tr>)}</tbody>
      </table></div>
    </details>}
  </div>;
}
