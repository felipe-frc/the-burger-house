import { useState } from 'react';
import type { FinanceDates, FinancePeriod } from '../../services/ownerFinance';

interface Props { period: FinancePeriod; dates?: FinanceDates; hasShift?: boolean; onChange: (period: FinancePeriod, dates?: FinanceDates) => void }
export function FinancePeriodFilter({ period, dates, hasShift, onChange }: Props) {
  const [custom, setCustom] = useState(period === 'custom');
  const [error, setError] = useState('');
  return <div className="flex flex-wrap items-end gap-3">
    <label className="owner-field"><span>Período</span>
      <select value={custom ? 'custom' : period} onChange={event => {
        const next = event.target.value as FinancePeriod;
        setCustom(next === 'custom'); setError('');
        if (next !== 'custom') onChange(next);
      }}>
        <option value="today">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option>
        {hasShift && <option value="shift">Turno configurado</option>}
        <option value="month">Mês atual</option><option value="custom">Personalizado</option>
      </select>
    </label>
    {custom && <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const start = String(form.get('start'));
      const end = String(form.get('end'));
      const span = (Date.parse(end) - Date.parse(start)) / 86400000;
      if (!(span >= 0 && span <= 366)) { setError('Informe um intervalo válido de até 366 dias.'); return; }
      setError(''); onChange('custom', { start, end });
    }}>
      <label className="owner-field"><span>Início do período</span><input name="start" type="date" required defaultValue={dates?.start} /></label>
      <label className="owner-field"><span>Fim do período</span><input name="end" type="date" required defaultValue={dates?.end} /></label>
      <button className="owner-button">Filtrar período</button>
      {error && <p role="alert">{error}</p>}
    </form>}
  </div>;
}
