import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Clipboard, MapPin } from 'lucide-react';
import { Modal } from '../common/Modal';
import { formatOwnerDateTime } from '../../services/ownerPresentation';
import { grantDeliveryTracking, loadCouriers, loadDeliveryTracking, revokeDeliveryTracking, type DeliveryTrackingState } from '../../services/ownerDeliveryTracking';

const Map = lazy(() => import('../../../../frontend/src/components/DeliveryTrackingMap'));
const labels = { Unassigned: 'Sem entregador vinculado', Waiting: 'Aguardando uma posição', Stopped: 'Compartilhamento inativo',
  Active: 'Compartilhamento ativo', Stale: 'Posição desatualizada', Expired: 'Vínculo expirado' };

export function DeliveryTrackingModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [state, setState] = useState<DeliveryTrackingState>();
  const [couriers, setCouriers] = useState<{ id: number; name: string }[]>();
  const [readError, setReadError] = useState('');
  const [courierError, setCourierError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [grant, setGrant] = useState<{ link: string; expiresAt: string }>();
  const retry = () => setRevision(value => value + 1);

  useEffect(() => {
    const requests = new AbortController();
    const options = requests.signal;
    let pending = false;
    async function update(explicit = false) {
      if (pending || (!explicit && document.hidden)) return;
      pending = true;
      try {
        const data = await loadDeliveryTracking(id, options);
        if (!options.aborted) { setState(data); setReadError(''); }
      } catch (failure) {
        if (!options.aborted) { setState(undefined); setReadError(failure instanceof Error ? failure.message : 'Mapa indisponível.'); }
      } finally { pending = false; }
    }
    void update(true);
    loadCouriers(options).then(data => { if (!options.aborted) { setCouriers(data); setCourierError(''); } })
      .catch(() => { if (!options.aborted) setCourierError('Não foi possível consultar entregadores.'); });
    const timer = window.setInterval(() => void update(), 10_000);
    return () => { requests.abort(); window.clearInterval(timer); };
  }, [id, revision]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const courierId = Number(new FormData(event.currentTarget).get('courier'));
    if (!courierId) return;
    setBusy(true); setWriteError(''); setGrant(undefined); setNotice('');
    try {
      const response = await grantDeliveryTracking(id, courierId);
      const invitation = new URL(`/admin/courier/${response.orderId}`, window.location.origin);
      invitation.hash = response.token;
      setGrant({ link: invitation.href, expiresAt: response.expiresAtUtc });
      retry();
    } catch (failure) { setWriteError(failure instanceof Error ? failure.message : 'Falha ao vincular entregador.'); }
    finally { setBusy(false); }
  }

  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={`Acompanhamento da entrega #${id}`}>
    <div className="space-y-3">
      {readError && <p role="alert">{readError} <button className="owner-button" onClick={retry}>Tentar novamente</button></p>}
      {!state && !readError && <p role="status">Consultando acompanhamento…</p>}
      {state && <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p><strong>{state.courierName ?? 'Entregador ainda não vinculado'}</strong> · <span className="owner-status" data-tone={state.state === 'Active' ? 'teal' : state.state === 'Stale' ? 'amber' : 'slate'}>{labels[state.state]}</span></p>
          <button className="owner-button" type="button" onClick={retry}>Atualizar localização</button>
        </div>
        {state.lastReportedAtUtc && <p className="owner-muted">Último recebimento {formatOwnerDateTime(state.lastReportedAtUtc)}</p>}
        {state.latitude !== null && state.longitude !== null && <>
          <Suspense fallback={<p role="status">Carregando mapa…</p>}><Map latitude={state.latitude} longitude={state.longitude} /></Suspense>
          <p className="owner-muted flex items-center gap-2"><MapPin size={15} aria-hidden="true" />{state.latitude.toFixed(5)}, {state.longitude.toFixed(5)}{state.accuracy !== null && ` · precisão de ${state.accuracy} m`}</p>
        </>}
      </>}
      {courierError && <p role="alert">{courierError} <button className="owner-button" onClick={retry}>Atualizar equipe</button></p>}
      {couriers?.length === 0 && <p className="owner-muted">Cadastre um colaborador ativo com cargo Entregador para emitir o acesso.</p>}
      {!!couriers?.length && state && <form onSubmit={event => void assign(event)} className="flex flex-wrap items-end gap-2">
        <label className="owner-field"><span>Entregador responsável</span><select name="courier" required defaultValue="" disabled={busy}>
          <option value="" disabled>Selecione</option>{couriers.map(courier => <option key={courier.id} value={courier.id}>{courier.name}</option>)}
        </select></label><button className="owner-button owner-primary" disabled={busy}>Gerar link privado</button>
      </form>}
      {state?.courierName && <button type="button" className="owner-button owner-button-critical" disabled={busy} onClick={async () => {
        setBusy(true); setWriteError(''); setNotice('');
        try { await revokeDeliveryTracking(id); setGrant(undefined); setNotice('Acesso revogado.'); retry(); }
        catch (failure) { setWriteError(failure instanceof Error ? failure.message : 'Falha ao revogar.'); }
        finally { setBusy(false); }
      }}>Revogar acesso</button>}
      {grant && <div className="owner-panel p-3 space-y-2">
        <label className="owner-field"><span>Link privado da entrega</span><input value={grant.link} readOnly onFocus={event => event.currentTarget.select()} /></label>
        <p className="owner-muted">Entregue pessoalmente ao responsável. Expira em {formatOwnerDateTime(grant.expiresAt)}.</p>
        <button className="owner-button" onClick={async () => {
          try { await navigator.clipboard.writeText(grant.link); setNotice('Link copiado.'); }
          catch { setNotice('Selecione e copie o endereço no campo acima.'); }
        }}><Clipboard size={15} aria-hidden="true" /> Copiar link</button>
      </div>}
      {notice && <p role="status">{notice}</p>}{writeError && <p role="alert">{writeError}</p>}
    </div>
  </Modal>;
}
