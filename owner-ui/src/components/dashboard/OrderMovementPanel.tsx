import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { adjacentMonth, loadOrderMovement, movementByWeekday, movementCalendar, movementDateLabel, movementMonthLabel,
  type MovementCell, type OrderMovement } from '../../services/ownerMovement';
import { formatOwnerPercentage } from '../../services/ownerPresentation';

const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const modes = { weekly: 'Dia e horário', monthly: 'Mensal' } as const;
type Mode = keyof typeof modes;
type MovementResult = { scope: string; report?: OrderMovement; error?: string };
const countLabel = (count: number) => `${count} ${count === 1 ? 'pedido' : 'pedidos'}`;

function MovementGrid({ rows, total, labels, range }: { rows: (MovementCell | null)[]; total: number; labels?: string[]; range?: string }) {
  const first = rows.findIndex(cell => cell && !cell.future);
  const [active, setActive] = useState(first);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const maximum = Math.max(0, ...rows.map(cell => cell?.count ?? 0));
  const selection = hovered ?? (focused || pinned ? active : null);
  const selected = selection === null ? null : rows[selection];
  const detail = (cell: MovementCell) => cell.future ? 'Dia futuro' : [
    countLabel(cell.count), total > 0 ? `${formatOwnerPercentage(cell.count / total * 100)} do total` : '', cell.peak,
  ].filter(Boolean).join(' · ');

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
    if (!step && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    let next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : active + step;
    const advance = event.key === 'Home' ? 1 : event.key === 'End' ? -1 : step;
    while (next >= 0 && next < rows.length && !rows[next]) next += advance;
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus();
  }

  return <>
    <div className={`owner-movement-grid ${labels ? 'owner-movement-weekly' : 'owner-movement-calendar'}`}
      role="group" aria-label={labels ? 'Mapa por dia e horário' : 'Calendário de movimento'}
      onKeyDown={navigate} onMouseLeave={() => setHovered(null)}>
      {labels ? <span aria-hidden="true" /> : null}
      {weekdays.map(day => <span key={day} className="owner-movement-axis" aria-hidden="true">{day}</span>)}
      {rows.map((cell, index) => {
        const slot = labels && index % 7 === 0 ? <span className="owner-movement-axis" aria-hidden="true">{labels[index / 7]}</span> : null;
        return <div className="owner-movement-slot" key={index}>
          {slot}
          {cell ? <button type="button" className="owner-movement-cell" data-cell={index}
            data-level={cell.count === 0 ? 0 : Math.ceil(cell.count / maximum * 4)}
            data-future={cell.future || undefined} data-current={selection === index || undefined}
            tabIndex={active === index ? 0 : -1} aria-label={`${cell.title} · ${detail(cell)}`}
            onMouseEnter={() => setHovered(index)}
            onFocus={() => { setActive(index); setFocused(true); setHovered(null); }}
            onBlur={() => setFocused(false)}
            onClick={() => { setActive(index); setPinned(true); }}>
            {labels ? cell.count || '·' : cell.label}
          </button> : <span aria-hidden="true" />}
        </div>;
      })}
    </div>
    <div className="owner-movement-key owner-muted">
      <span><i data-level="0" />Sem pedidos</span>
      <span>Menor <i data-level="1" /><i data-level="2" /><i data-level="3" /><i data-level="4" /> Maior</span>
      {!labels ? <span><i data-future />Futuro</span> : null}
    </div>
    <div className="owner-movement-detail" role="status">
      {selected ? <><strong>{selected.title}</strong><span>{detail(selected)}</span>{range ? <span>{range}</span> : null}</>
        : <span className="owner-muted">{total ? countLabel(total) + ' no período' : 'Sem pedidos no período.'}</span>}
    </div>
  </>;
}

export function OrderMovementPanel({ channel, revision, showcase }: { channel?: string; revision: number; showcase: boolean }) {
  const id = useId();
  const [mode, setMode] = useState<Mode>('weekly');
  const [month, setMonth] = useState('current');
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<Partial<Record<Mode, MovementResult>>>({});
  const requestedMonth = mode === 'monthly' ? month : undefined;
  const scope = JSON.stringify([requestedMonth, channel, revision, attempt]);
  const result = results[mode]?.scope === scope ? results[mode] : undefined;

  useEffect(() => {
    if (showcase || result) return;
    const controller = new AbortController();
    const save = (payload: Omit<MovementResult, 'scope'>) => {
      if (!controller.signal.aborted) setResults(previous => ({ ...previous, [mode]: { scope, ...payload } }));
    };
    loadOrderMovement(requestedMonth, channel, controller.signal).then(report => save({ report }))
      .catch((error: Error) => save({ error: error.message }));
    return () => controller.abort();
  }, [mode, requestedMonth, channel, showcase, scope, result]);

  const report = result?.report;
  const displayedMonth = month === 'current' ? report?.start.slice(0, 7) : month;
  const total = report?.hours.reduce((sum, point) => sum + point.count, 0) ?? 0;
  const bands = report && mode === 'weekly' ? movementByWeekday(report) : null;
  const range = report && mode === 'weekly' ? `${movementDateLabel(report.start)} a ${movementDateLabel(report.end)}` : undefined;
  return <section className="owner-panel owner-movement-panel p-4 space-y-3" aria-labelledby={id}>
    <div className="owner-overview-heading">
      <h2 className="owner-heading" id={id}>Movimento da hamburgueria</h2>
      <fieldset className="owner-channel-filter">
        <legend className="sr-only">Visualização do movimento</legend>
        <div className="owner-channel-options">
          {(Object.keys(modes) as Mode[]).map(value => <label key={value} className="owner-channel-segment">
            <input className="sr-only" type="radio" name={id} checked={mode === value} onChange={() => setMode(value)} />
            <span className="owner-channel-face">{modes[value]}</span>
          </label>)}
        </div>
      </fieldset>
    </div>
    {showcase ? <p className="owner-muted">Movimento disponível na sessão conectada à API.</p> : <>
      {mode === 'monthly' ? <div className="owner-movement-month">
        <button className="owner-icon-button" type="button" aria-label="Mês anterior"
          disabled={!displayedMonth || !report || displayedMonth === '0002-01'}
          onClick={() => displayedMonth && setMonth(adjacentMonth(displayedMonth, -1))}><ChevronLeft size={16} aria-hidden="true" /></button>
        <strong>{displayedMonth ? movementMonthLabel(displayedMonth) : 'Mês atual'}</strong>
        <button className="owner-icon-button" type="button" aria-label="Próximo mês"
          disabled={!displayedMonth || !report || displayedMonth >= report.today.slice(0, 7)}
          onClick={() => displayedMonth && setMonth(adjacentMonth(displayedMonth, 1))}><ChevronRight size={16} aria-hidden="true" /></button>
      </div> : null}
      <p className="owner-muted text-xs">{range ? `${range} · ` : ''}
        Horário de São Paulo · Pedidos sem cancelamento</p>
      {result?.error ? <p role="alert">{result.error} <button className="owner-button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></p>
        : !report ? <p role="status">Carregando movimento…</p>
        : <MovementGrid key={scope} total={total} labels={bands?.map(band => band.label)} range={range}
          rows={bands ? bands.flatMap(band => band.cells) : movementCalendar(report)} />}
    </>}
  </section>;
}
