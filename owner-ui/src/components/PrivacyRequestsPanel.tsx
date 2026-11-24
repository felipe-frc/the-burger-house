import { useState } from 'react';
import { adminRequest } from '../services/adminHttp';

type Request = { id: string; orderId: number; kind: string; state: string; decision: string | null; createdAt: string; revision: number };
type Batch = { items: Request[]; total: number; page: number; pageSize: number };
const kinds: Record<string, string> = { access: 'Acesso', correction: 'Correção', erasure: 'Eliminação', revoke: 'Revogação', information: 'Informações', portability: 'Portabilidade', objection: 'Oposição', review: 'Revisão' };

export function PrivacyRequestsPanel() {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Request | null>(null);
  const [correction, setCorrection] = useState<{ name: string; email: string; phone: string } | null>(null);
  const load = async (page = 1) => {
    if (busy) return;
    setBusy(true); setError('');
    try { setBatch(await adminRequest<Batch>(`/api/admin/privacy/requests?page=${page}`)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha ao carregar solicitações.'); }
    finally { setBusy(false); }
  };
  return <section className="owner-panel p-5 space-y-3" aria-labelledby="privacy-requests-title">
    <h2 id="privacy-requests-title" className="owner-heading">Solicitações de privacidade</h2>
    <p className="owner-muted">Canal opcional. Exige configuração jurídica e migration própria autorizada. Sem exclusões automáticas. A minimização preserva registros financeiros e não equivale a anonimização irreversível.</p>
    <button type="button" className="owner-button" disabled={busy} onClick={() => void load(batch?.page ?? 1)}>{busy ? 'Carregando…' : 'Carregar solicitações'}</button>
    {error && <p role="alert">{error}</p>}
    {batch && <>
      <p role="status">{batch.total} solicitação(ões) · página {batch.page}</p>
      {!batch.items.length && <p>Nenhuma solicitação registrada.</p>}
      <ul className="space-y-3">{batch.items.map(request => <li key={request.id} className="owner-panel p-3">
        <p>{kinds[request.kind] ?? 'Solicitação'} · Pedido #{request.orderId} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(request.createdAt))}</p>
        <p className="owner-muted">Protocolo {request.id} · {request.state === 'Processed' ? 'Processada' : request.state === 'Retained' ? 'Retida para revisão' : 'Recebida'}</p>
        {request.state !== 'Processed' && <button type="button" className="owner-button" disabled={busy} onClick={async () => {
          setBusy(true); setError(''); setSelected(null); setCorrection(null);
          try { const detail = await adminRequest<{ request: Request; correction: typeof correction }>(`/api/admin/privacy/requests/${request.id}`); setSelected(detail.request); setCorrection(detail.correction); }
          catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha ao carregar detalhes.'); }
          finally { setBusy(false); }
        }}>Revisar solicitação do pedido #{request.orderId}</button>}
      </li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="owner-button" disabled={busy || batch.page <= 1} onClick={() => void load(batch.page - 1)}>Anterior</button>
        <button type="button" className="owner-button" disabled={busy || batch.page * batch.pageSize >= batch.total} onClick={() => void load(batch.page + 1)}>Próxima</button>
      </div>
    </>}
    {selected && <form key={selected.id} className="space-y-3" onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      const data = new FormData(event.currentTarget); setBusy(true); setError('');
      try {
        await adminRequest(`/api/admin/privacy/requests/${selected.id}/review`, { method: 'POST', body: JSON.stringify({ revision: selected.revision,
          action: data.get('action'), retentionReviewed: data.get('retention') === 'on', confirmation: data.get('confirmation') }) });
        setSelected(null); setBatch(await adminRequest<Batch>(`/api/admin/privacy/requests?page=${batch?.page ?? 1}`));
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha ao processar solicitação.'); }
      finally { setBusy(false); }
    }}>
      <h3 className="owner-heading">Revisar {kinds[selected.kind]} · #{selected.orderId}</h3>
      {correction && <dl className="break-words"><dt>Nome solicitado</dt><dd>{correction.name}</dd><dt>Telefone solicitado</dt><dd>{correction.phone}</dd><dt>E-mail solicitado</dt><dd>{correction.email}</dd></dl>}
      <fieldset className="space-y-3" disabled={busy}>
        <label className="owner-field"><span>Decisão administrativa</span><select name="action" required>
          <option value="RetainForReview">Reter para revisão fundamentada</option>
          <option value="ProvideInformation">Registrar atendimento informativo</option>
          {selected.kind === 'correction' && <option value="ApplyCorrection">Aplicar contato corrigido solicitado</option>}
          {selected.kind === 'erasure' && <option value="MinimizeContact">Minimizar identificadores locais</option>}
        </select></label>
        <label className="owner-check"><input type="checkbox" name="retention" />Revisei as obrigações de retenção, contestações e atendimento. Alterações só são permitidas em pedidos encerrados.</label>
        {selected.kind === 'erasure' && <label className="owner-field"><span>Para minimizar, digite MINIMIZAR. Não apaga valores, pedidos ou pagamentos.</span><input name="confirmation" maxLength={24} autoComplete="off" /></label>}
        <div className="flex flex-wrap gap-2"><button className="owner-button owner-primary" type="submit">{busy ? 'Salvando…' : 'Registrar decisão'}</button><button className="owner-button" type="button" onClick={() => setSelected(null)}>Cancelar revisão</button></div>
      </fieldset>
    </form>}
  </section>;
}
