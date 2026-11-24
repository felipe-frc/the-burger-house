import { useEffect, useState } from 'react';
import { loadOperationSettings, saveOperationSettings, type OperationSettingsDto } from '../services/ownerSettings';
import { adminRequest } from '../services/adminHttp';
import { CurrencyValue } from './common/CurrencyValue';
import { LockKeyhole } from 'lucide-react';
export function OperationSettingsForm({ onLimitsSaved }: { onLimitsSaved: () => void }) {
  const [settings, setSettings] = useState<OperationSettingsDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState<OperationSettingsDto['limits'] | null>(null);
  const [reload, setReload] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [storeError, setStoreError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setSettings(null);
    loadOperationSettings(controller.signal).then(result => {
      if (!controller.signal.aborted) { setSettings(result); setBaseline(result.limits); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    setStoreError(false);
    adminRequest<{ deliveryFee: number }>('/api/admin/store', { signal: controller.signal })
      .then(store => { if (!controller.signal.aborted) setDeliveryFee(store.deliveryFee); })
      .catch(() => { if (!controller.signal.aborted) setStoreError(true); });
    return () => controller.abort();
  }, [reload]);
  const keys = ['preparing', 'readyForPickup', 'outForDelivery'] as const;
  const scheduleSupported = !!settings && Object.hasOwn(settings.limits, 'schedule');
  const schedule = settings?.limits.schedule;
  const dirty = !!settings && (keys.some(key => settings.limits[key] !== baseline?.[key]) ||
    (settings.limits.pendingPaymentAgeHours ?? 0) !== (baseline?.pendingPaymentAgeHours ?? 0) ||
    schedule?.enabled !== baseline?.schedule?.enabled || schedule?.start !== baseline?.schedule?.start ||
    schedule?.end !== baseline?.schedule?.end);
  return <section className="space-y-4">
    {error && <div role="alert">{error} <button onClick={() => setReload(value => value + 1)}>Recarregar</button></div>}
    {!settings && !error && <p role="status">Carregando configurações…</p>}
    {settings && <form className="owner-panel p-5 space-y-4 owner-settings-limits-compact" onSubmit={async event => {
      event.preventDefault(); if (busy || !dirty) return;
      if (schedule?.enabled && (!schedule.start || !schedule.end || schedule.start === schedule.end)) {
        setError('Informe horários diferentes de início e fim do turno.');
        return;
      }
      setBusy(true); setError(''); setSaved(false);
      try {
        const updated = await saveOperationSettings(settings);
        setSettings(updated);
        setBaseline(updated.limits);
        setSaved(true);
        onLimitsSaved();
      }
      catch (error) { setError(error instanceof Error ? error.message : 'Falha ao salvar.'); }
      finally { setBusy(false); }
    }}>
      <h2 className="owner-heading">Metas da operação</h2>
      <p className="owner-muted">Valores em minutos. Zero desativa o alerta da etapa.</p>
      <div className="grid gap-3 sm:grid-cols-3 owner-settings-metrics-grid">{keys.map(key => <label key={key} className="owner-field">
        <span>{{ preparing: 'Em preparo', readyForPickup: 'Em conferência', outForDelivery: 'Em rota' }[key]}</span>
        <input type="number" required min={0} max={1440} step="1" disabled={busy}
          value={settings.limits[key]} onChange={event => { setSaved(false); setSettings({ ...settings, limits: { ...settings.limits, [key]: Number(event.target.value) } }); }} />
      </label>)}</div>
      {scheduleSupported && <div className="space-y-3">
        <label className="owner-field max-w-xs"><span>Alerta de pagamento pendente (horas)</span>
          <input type="number" min={0} max={8760} step={1} value={settings.limits.pendingPaymentAgeHours ?? 0} disabled={busy}
            onChange={event => { setSaved(false); setSettings({ ...settings, limits: { ...settings.limits, pendingPaymentAgeHours: Number(event.target.value) } }); }} />
        </label>
        <p className="owner-muted">Zero desativa o alerta. O painel sinaliza o pedido para revisão e preserva o pagamento.</p>
        <label className="owner-check"><input type="checkbox" checked={schedule?.enabled ?? false} disabled={busy}
          onChange={event => {
            setSaved(false);
            setSettings({ ...settings, limits: { ...settings.limits, schedule: { ...schedule, enabled: event.target.checked } } });
          }} /> Configurar horário do turno</label>
        {schedule?.enabled && <div className="flex flex-wrap gap-3">
          {(['start', 'end'] as const).map(key => <label key={key} className="owner-field">
            <span>{key === 'start' ? 'Início do turno' : 'Fim do turno'}</span>
            <input type="time" required disabled={busy} value={schedule[key] ?? ''} onChange={event => {
              setSaved(false);
              setSettings({ ...settings, limits: { ...settings.limits, schedule: { ...schedule, [key]: event.target.value } } });
            }} />
          </label>)}
        </div>}
        <p className="owner-muted">Horário de Brasília. O turno pode terminar no dia seguinte.</p>
      </div>}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy || !dirty} className="owner-button owner-primary">{busy ? 'Salvando…' : 'Salvar alterações'}</button>
        {dirty && <span className="owner-muted">Alterações não salvas</span>}
      </div>
      {saved && <p role="status">Configurações confirmadas pelo servidor.</p>}
    </form>}
    <div className="owner-panel p-5 space-y-2">
      <h2 className="owner-heading">Loja</h2>
      <p className="flex items-center gap-2"><LockKeyhole size={16} aria-hidden="true" /> Taxa de entrega · {storeError ? 'Indisponível' : deliveryFee == null ? 'Carregando…' : <CurrencyValue value={deliveryFee} size="sm" />}</p>
      <p className="owner-muted">A taxa exibida é a mesma aplicada no checkout. A edição pelo painel está indisponível.</p>
    </div>
  </section>;
}
