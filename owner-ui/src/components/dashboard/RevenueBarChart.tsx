import { useId } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { RevenuePoint } from '../../services/ownerFinance';
import { formatOwnerMoney } from '../../services/ownerPresentation';

const axisMoney = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function periodTick(date: string) {
  return date.includes('T') ? date.slice(11, 16) : `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function RevenueTooltip({ active, label, payload }: TooltipContentProps) {
  const value = payload[0]?.value;
  if (!active || typeof label !== 'string' || typeof value !== 'number') return null;

  const date = `${label.slice(8, 10)}/${label.slice(5, 7)}/${label.slice(0, 4)}`;
  return <div className="owner-revenue-tooltip" role="status">
    <span>{label.includes('T') ? `${date} · ${periodTick(label)}` : date}</span>
    <strong>Receita bruta {formatOwnerMoney(value)}</strong>
  </div>;
}

export function RevenueBarChart({ points }: { points: RevenuePoint[] }) {
  const gradientId = useId();

  return <div className="owner-revenue-plot">
    <BarChart
      responsive
      width="100%"
      height={176}
      data={points}
      accessibilityLayer
      title="Receita bruta por período"
      desc="Use as setas para percorrer os valores. Os mesmos dados estão disponíveis na tabela."
      margin={{ top: 8, right: 9, bottom: 0, left: 0 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFAB91" />
          <stop offset="48%" stopColor="#E85D4A" />
          <stop offset="100%" stopColor="#B73541" />
        </linearGradient>
      </defs>
      <CartesianGrid vertical={false} stroke="var(--owner-border)" strokeDasharray="3 4" />
      <XAxis dataKey="date" tickFormatter={periodTick} interval="preserveStartEnd" minTickGap={14}
        height={24} tickMargin={8} tickLine={false} axisLine={false} tick={{ fill: 'var(--owner-muted)', fontSize: 11 }} />
      <YAxis width={66} domain={[0, 'auto']} tickFormatter={value => axisMoney.format(value)}
        tickCount={4} tickMargin={6} tickLine={false} axisLine={false} tick={{ fill: 'var(--owner-muted)', fontSize: 11 }} />
      <Tooltip content={RevenueTooltip} cursor={{ fill: 'var(--owner-current)' }} isAnimationActive="auto" />
      <Bar dataKey="revenue" name="Receita bruta" fill={`url(#${gradientId})`} radius={[5, 5, 0, 0]} maxBarSize={26}
        stroke="var(--owner-revenue-bar-edge)" strokeWidth={0.75}
        activeBar={{ stroke: 'var(--owner-fg)', strokeWidth: 1.2 }}
        animationDuration={360} animationEasing="ease-out" isAnimationActive="auto" />
    </BarChart>
  </div>;
}
