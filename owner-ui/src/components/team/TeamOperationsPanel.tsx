import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatOwnerDateTime, formatOwnerMoney, formatOwnerTime } from '../../services/ownerPresentation';
import { appendTeamJournal, loadTeamOperations, saveTeamWorkDay, type JournalWrite, type TeamOperations } from '../../services/ownerTeamOperations';

export type TeamArea = 'staff' | 'attendance' | 'payments' | 'journal';
type OperationsArea = Exclude<TeamArea, 'staff'>;
const punches = { In: 'Entrada', BreakStart: 'Início do intervalo', BreakEnd: 'Fim do intervalo', Out: 'Saída' };
const notes = { Recognition: 'Reconhecimento', Occurrence: 'Ocorrência', Note: 'Observação', Caveat: 'Ressalva', Adjustment: 'Ajuste de jornada' };
const statuses: Record<string, string> = { Scheduled: 'Previsto', Open: 'Em aberto', Absent: 'Falta', Worked: 'Concluído', Planned: 'Previsto', Paid: 'Pago', Adjustment: 'Ajuste', Monthly: 'Mensal', Hourly: 'Por hora' };
const dateLabel = (date: string) => date.split('-').reverse().join('/');
const duration = (minutes: number | null) => minutes === null ? '—' : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
const operationalToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export function TeamOperationsPanel({ area, memberId, memberName }: { area: OperationsArea; memberId: number; memberName: string }) {
  const [month, setMonth] = useState(() => operationalToday().slice(0, 7));
  const [day, setDay] = useState(() => operationalToday());
  const [change, setChange] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: TeamOperations; error?: string }>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState<string>();
  const [paymentStatus, setPaymentStatus] = useState('Planned');
  const request = useRef<{ key: string; id: string } | undefined>(undefined);
  const writing = useRef(false);
  const punchTime = useRef<HTMLInputElement>(null);
  const key = `${memberId}:${month}`;
  const current = result?.key === key ? result : undefined;
  const data = current?.data;
  const retry = () => { setResult(undefined); setChange(value => value + 1); };

  useEffect(() => { if (correcting) punchTime.current?.focus(); }, [correcting]);

  useEffect(() => {
    if (!month) return;
    const controller = new AbortController();
    void loadTeamOperations(memberId, month, controller.signal).then(value => {
      if (!controller.signal.aborted) setResult({ key, data: value });
    }).catch(cause => {
      if (!controller.signal.aborted) setResult({ key, error: cause instanceof Error ? cause.message : 'Falha ao consultar equipe.' });
    });
    return () => controller.abort();
  }, [key, memberId, month, change]);

  async function write(event: FormEvent<HTMLFormElement>, action: (fields: FormData) => Promise<unknown>) {
    event.preventDefault();
    if (writing.current) return;
    const form = event.currentTarget;
    writing.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action(new FormData(form));
      form.reset();
      request.current = undefined;
      setCorrecting(undefined);
      setNotice('Registro confirmado pelo servidor.');
      retry();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'O registro não foi salvo.'); }
    finally { writing.current = false; setBusy(false); }
  }

  function append(body: Omit<JournalWrite, 'requestId'>) {
    const signature = JSON.stringify([memberId, body]);
    if (request.current?.key !== signature) request.current = { key: signature, id: crypto.randomUUID() };
    return appendTeamJournal(memberId, { ...body, requestId: request.current.id });
  }

  const replaced = new Set(data?.entries.map(entry => entry.replacesId));
  const selected = data?.days.find(row => row.date === day);
  const activeCorrection = data?.entries.find(entry => entry.id === correcting);
  const periods = area === 'attendance' ? data?.entries.filter(entry => entry.kind in punches) : area === 'payments'
    ? data?.entries.filter(entry => entry.kind === 'Payment' || entry.kind === 'PayPolicy') : data?.entries.filter(entry => entry.kind in notes);
  return <section className="owner-panel p-4 space-y-4" aria-label={`${memberName} · gestão de equipe`}>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 className="owner-heading">{area === 'attendance' ? 'Ponto e jornada' : area === 'payments' ? 'Pagamentos e remuneração' : 'Histórico administrativo'}</h2>
        <p className="owner-muted">{memberName} · horário de Brasília</p></div>
      <label className="owner-field"><span>Competência</span><input type="month" value={month} disabled={busy} required onChange={event => {
        if (!event.target.value) return;
        setMonth(event.target.value); setDay(event.target.value + '-01'); setCorrecting(undefined); setNotice(''); setError('');
      }} /></label>
    </div>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {current?.error ? <p role="alert">{current.error} <button type="button" className="owner-button" onClick={retry}>Tentar novamente</button></p>
      : !data ? <p role="status">Consultando registros…</p> : <>
      {area === 'attendance' && <>
        <p className="owner-muted">{data.workedDays} dias concluídos · {data.absences} faltas · {data.lateDays} dias com atraso · {duration(data.workedMinutes)} trabalhadas · {duration(data.extraMinutes)} acima da escala.</p>
        <div className="owner-table-shell"><table className="owner-table"><caption className="sr-only">Jornada prevista e realizada</caption>
          <thead><tr>{['Dia', 'Previsto', 'Trabalhado', 'Extras', 'Atraso', 'Entrada antecipada', 'Saída antecipada', 'Situação'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{data.days.map(row => <tr key={row.date}>
            <th scope="row">{dateLabel(row.date)}</th><td>{duration(row.plannedMinutes)}</td><td>{duration(row.workedMinutes)}</td><td>{duration(row.extraMinutes)}</td>
            <td>{duration(row.lateMinutes)}</td><td>{duration(row.earlyEntryMinutes)}</td><td>{duration(row.earlyExitMinutes)}</td><td>{statuses[row.state] ?? row.state}</td>
          </tr>)}</tbody>
        </table></div>
        {!data.days.length && <p className="owner-muted">Nenhum turno ou marcação na competência.</p>}
        <label className="owner-field w-fit"><span>Dia do turno</span><input type="date" min={`${month}-01`} max={`${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`} value={day} required disabled={busy} onChange={event => {
          if (event.target.value) setDay(event.target.value);
        }} /></label>
        <div className="grid gap-3 lg:grid-cols-2">
          <form key={day} className="space-y-2" onSubmit={event => void write(event, fields => saveTeamWorkDay(memberId, day, {
            start: String(fields.get('start')), end: String(fields.get('end')),
            breakMinutes: Number(fields.get('break')), revision: selected?.revision ?? 0,
          }))}>
            <h3 className="owner-heading">Escala do dia</h3>
            <fieldset disabled={busy} className="space-y-2">
              <label className="owner-field"><span>Início previsto</span><input name="start" type="time" required defaultValue={selected?.startsAtUtc ? formatOwnerTime(selected.startsAtUtc) : undefined} /></label>
              <label className="owner-field"><span>Fim previsto</span><input name="end" type="time" required defaultValue={selected?.endsAtUtc ? formatOwnerTime(selected.endsAtUtc) : undefined} /></label>
              <label className="owner-field"><span>Intervalo previsto em minutos</span><input name="break" type="number" min="0" max="1439" required defaultValue={selected?.plannedBreakMinutes ?? 0} /></label>
              <p className="owner-muted text-xs">Um fim anterior ao início encerra o turno no dia seguinte.</p>
              <button className="owner-button owner-primary">Salvar escala</button>
            </fieldset>
          </form>
          <form key={correcting ?? 'punch'} className="space-y-2" onSubmit={event => void write(event, fields => append({
            date: activeCorrection?.date ?? day, kind: activeCorrection?.kind ?? String(fields.get('kind')),
            atLocal: String(fields.get('at')), replacesId: correcting, note: String(fields.get('note') ?? ''),
          }))}>
            <h3 className="owner-heading">{activeCorrection ? `Corrigir ${punches[activeCorrection.kind as keyof typeof punches]}` : 'Registrar ponto'}</h3>
            <fieldset disabled={busy} className="space-y-2">
              {!activeCorrection && <label className="owner-field"><span>Tipo de marcação</span><select name="kind">{Object.entries(punches).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
              <label className="owner-field"><span>Data e horário da marcação</span><input ref={punchTime} name="at" type="datetime-local" required /></label>
              <label className="owner-field"><span>{activeCorrection ? 'Motivo da correção' : 'Observação'}</span><input name="note" maxLength={1000} required={!!activeCorrection} /></label>
              <div className="flex flex-wrap gap-2"><button className="owner-button owner-primary">{activeCorrection ? 'Confirmar correção' : 'Registrar marcação'}</button>
                {activeCorrection && <button type="button" className="owner-button" onClick={() => setCorrecting(undefined)}>Cancelar correção</button>}</div>
            </fieldset>
          </form>
        </div>
      </>}
      {area === 'payments' && <>
        <p className="owner-muted">{data.payPolicy?.amount != null ? `Remuneração configurada ${formatOwnerMoney(data.payPolicy.amount)} · ${statuses[data.payPolicy.status ?? ''] ?? ''}.` : 'Remuneração sem configuração para a competência.'}</p>
        <p>{data.extraAmount === null ? 'Previsão indisponível. Confira a escala, as marcações e o valor-hora extra contratual.' : `Estimativa bruta de horas extras ${formatOwnerMoney(data.extraAmount)} com a tarifa contratual informada.`}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={event => void write(event, fields => append({ date: month + '-01', kind: 'PayPolicy',
            status: String(fields.get('type')), amount: Number(fields.get('amount')),
            overtimeHourlyRate: fields.get('rate') ? Number(fields.get('rate')) : undefined }))}>
            <h3 className="owner-heading">Configurar remuneração</h3>
            <fieldset disabled={busy} className="space-y-2 mt-2">
              <label className="owner-field"><span>Modalidade</span><select name="type"><option value="Monthly">Mensal</option><option value="Hourly">Por hora</option></select></label>
              <label className="owner-field"><span>Remuneração em reais</span><input type="number" name="amount" min="0.01" max="999999.99" step="0.01" required /></label>
              <label className="owner-field"><span>Valor-hora extra contratual em reais</span><input type="number" name="rate" min="0.01" max="999999.99" step="0.01" /></label>
              <button className="owner-button owner-primary">Salvar remuneração</button>
            </fieldset>
          </form>
          <form onSubmit={event => void write(event, fields => append({ date: month + '-01', kind: 'Payment', status: String(fields.get('status')),
            amount: Number(fields.get('amount')), atLocal: String(fields.get('at') || '') || undefined,
            reference: String(fields.get('reference') || ''), note: String(fields.get('note') || '') }))}>
            <h3 className="owner-heading">Registrar previsão, ajuste ou pagamento</h3>
            <fieldset disabled={busy} className="space-y-2 mt-2">
              <label className="owner-field"><span>Situação</span><select name="status" value={paymentStatus} onChange={event => setPaymentStatus(event.target.value)}><option value="Planned">Previsto</option><option value="Paid">Pago</option><option value="Adjustment">Ajuste</option></select></label>
              <label className="owner-field"><span>Valor em reais</span><input type="number" name="amount" min={paymentStatus === 'Adjustment' ? -999999.99 : 0.01} max="999999.99" step="0.01" required /></label>
              {paymentStatus === 'Adjustment' && <label className="owner-field"><span>Motivo do ajuste</span><input name="note" maxLength={1000} required /></label>}
              <label className="owner-field"><span>Data e horário do valor registrado</span><input name="at" type="datetime-local" /></label>
              <label className="owner-field"><span>Referência do comprovante</span><input name="reference" maxLength={250} /></label>
              <button className="owner-button owner-primary">Salvar registro administrativo</button>
            </fieldset>
          </form>
        </div>
      </>}
      {area === 'journal' && <form className="space-y-2" onSubmit={event => void write(event, fields => append({
        kind: String(fields.get('kind')), date: String(fields.get('date')), note: String(fields.get('note')),
      }))}>
        <fieldset className="space-y-2" disabled={busy}>
          <label className="owner-field"><span>Tipo de registro</span><select name="kind">{Object.entries(notes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="owner-field"><span>Data da ocorrência</span><input type="date" name="date" defaultValue={month + '-01'} required /></label>
          <label className="owner-field"><span>Observação administrativa</span><textarea name="note" maxLength={1000} required /></label>
          <button className="owner-button owner-primary">Registrar ocorrência</button>
        </fieldset>
      </form>}
      {periods?.length ? <ul className="space-y-2" aria-label="Histórico da competência">{periods.map(entry => <li key={entry.id} className="border-t border-current/15 pt-2">
        <p><strong>{punches[entry.kind as keyof typeof punches] ?? notes[entry.kind as keyof typeof notes] ?? (entry.kind === 'Payment' ? 'Pagamento registrado' : 'Remuneração registrada')}</strong> · {dateLabel(entry.date)} {entry.status && ` · ${statuses[entry.status] ?? entry.status}`}</p>
        <p className="owner-muted">{formatOwnerDateTime(entry.atUtc)} · Registrado em {formatOwnerDateTime(entry.recordedAtUtc)} · {entry.origin} #{entry.ownerId}</p>
        {entry.amount !== null && <p>{formatOwnerMoney(entry.amount)}{entry.overtimeHourlyRate !== null && ` · ${formatOwnerMoney(entry.overtimeHourlyRate)} por hora extra`}</p>}
        {entry.reference && <p>Referência {entry.reference}</p>}{entry.note && <p>{entry.note}</p>}
        {replaced.has(entry.id) ? <p>Marcação substituída, mantida no histórico.</p> : area === 'attendance' && <button type="button" disabled={busy} className="owner-button" onClick={() => setCorrecting(entry.id)}>Corrigir marcação</button>}
      </li>)}</ul> : <p className="owner-muted">Nenhum registro para a competência.</p>}
    </>}
  </section>;
}
