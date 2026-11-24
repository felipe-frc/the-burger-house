import { useId } from 'react';

export type SalesPeriod = 'today' | '7d' | '30d';
const periods: { value: SalesPeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' },
];

export function SalesPeriodSelector({ value, onChange }: { value: SalesPeriod; onChange: (value: SalesPeriod) => void }) {
  const id = useId();
  return <fieldset className="owner-channel-filter">
    <legend className="sr-only">Período de vendas</legend>
    <div className="owner-channel-options">
      {periods.map(period => <label className="owner-channel-segment" key={period.value}>
        <input type="radio" className="sr-only" name={id} value={period.value}
          checked={value === period.value} onChange={() => onChange(period.value)} />
        <span className="owner-channel-face">{period.label}</span>
      </label>)}
    </div>
  </fieldset>;
}
