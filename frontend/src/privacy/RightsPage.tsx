import { useEffect, useState } from 'react';
import { readSession } from '../checkout/model';
import { RECEIPT_KEY } from '../checkout/cartStorage';
import './legal.css';
type Config = { requestsEnabled: boolean; controllerName?: string; privacyContact?: string };
type Proof = { orderId: number; orderAccessToken: string };
type Protocol = { id: string; state: string; decision: string | null };
function currentProof(): Proof | null {
  try {
    try { localStorage.removeItem(RECEIPT_KEY); } catch { }
    const pending = readSession();
    const stored = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? 'null');
    const receipt = stored?.receipt ?? stored;
    const source = pending?.orderAccessToken ? pending : receipt;
    return Number.isSafeInteger(source?.orderId) && typeof source?.orderAccessToken === 'string' && source.orderAccessToken
      ? { orderId: source.orderId, orderAccessToken: source.orderAccessToken }
      : null;
  } catch { return null; }
}
export function RightsPage() {
  const [proof] = useState(currentProof);
  const [config, setConfig] = useState<Config | null>(null);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('access');
  const [requestId, setRequestId] = useState(() => {
    try { const saved = sessionStorage.getItem(`burger-house-rights-protocol:${proof?.orderId}`); if (saved && /^[a-f0-9-]{36}$/.test(saved)) return saved; } catch { /* session-only recovery unavailable */ }
    return crypto.randomUUID();
  });
  useEffect(() => { const control = new AbortController(); fetch('/api/privacy/config', { signal: control.signal, credentials: 'omit' })
    .then(async result => { if (!result.ok) throw new Error(); setConfig(await result.json()); })
    .catch(() => { if (!control.signal.aborted) setError('Não foi possível verificar o canal digital. Tente recarregar.'); });
    return () => control.abort(); }, []);
  const call = async (path: string, init?: RequestInit) => {
    if (!proof) throw new Error('Comprovante de acesso indisponível.');
    const result = await fetch(path, { ...init, credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Order-Access': proof.orderAccessToken }, cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!result.ok) throw new Error(result.status === 404 ? 'Comprovante ausente, expirado ou não autorizado. Não envie documentos em mensagens públicas.' : result.status === 503 ? 'Canal digital ainda não habilitado.' : 'Falha ao processar. Reutilize o mesmo protocolo ao tentar novamente.');
    return result.json();
  };
  return <><header><a href="/">The Burger House · Voltar à demonstração</a></header><main id="main-content" tabIndex={-1}>
    <h1>Seus dados e direitos</h1>
    <p className="legal-notice">Demonstração de portfólio. Canal sujeito a configuração e revisão jurídica. Não utilize dados pessoais reais nos testes.</p>
    <p>Você pode solicitar acesso, correção, eliminação quando cabível, informações, portabilidade, oposição, revisão ou revogação. Nenhuma solicitação apaga pagamentos ou pedidos automaticamente.</p>
    <p>Identidade do controlador: {config?.controllerName || 'PENDENTE DE CONFIGURAÇÃO'}. Contato verificado de privacidade: {config?.privacyContact || 'PENDENTE DE CONFIGURAÇÃO'}.</p>
    {!config?.requestsEnabled && <p role="status">Canal digital não habilitado. Ativação exige contato verificado, política de retenção e migration autorizada. Sem esses dados, não apresentamos um contato fictício como atendimento real.</p>}
    {!proof && <p>Este navegador não possui um comprovante de compra utilizável nesta sessão. O número do pedido, CPF ou e-mail isolados não autorizam acesso. O comprovante digital fica restrito à sessão atual da aba e não é persistido permanentemente; pedidos anteriores exigem verificação pelo futuro contato de privacidade.</p>}
    {error && <p role="alert">{error}</p>}
    {proof && config?.requestsEnabled && <>
      <form onSubmit={async event => {
        event.preventDefault(); if (busy) return; const form = new FormData(event.currentTarget);
        setBusy(true); setError('');
        try { sessionStorage.setItem(`burger-house-rights-protocol:${proof.orderId}`, requestId); } catch { /* Original request ID remains in memory. */ }
        try { setProtocol(await call('/api/privacy/requests', { method: 'POST', body: JSON.stringify({ id: requestId, orderId: proof.orderId, kind,
          correction: kind === 'correction' ? { name: form.get('name'), phone: form.get('phone'), email: form.get('email') } : null }) })); }
        catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
      }}>
        <fieldset disabled={busy || !!protocol}><legend>Pedido #{proof.orderId} · Solicitação verificada</legend>
          <label>Direito solicitado<select value={kind} onChange={event => setKind(event.target.value)}>
            {Object.entries({ access: 'Acesso', correction: 'Correção de contato', erasure: 'Eliminação quando cabível', revoke: 'Revogação', information: 'Informações sobre tratamento', portability: 'Portabilidade', objection: 'Oposição', review: 'Revisão' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          {kind === 'correction' && <><label>Nome corrigido<input name="name" required maxLength={120} autoComplete="name" /></label><label>Telefone corrigido<input name="phone" type="tel" required maxLength={25} autoComplete="tel" /></label><label>E-mail corrigido<input name="email" type="email" required maxLength={254} autoComplete="email" /></label></>}
          <p>A correção de contato depende de revisão administrativa. Pedidos ativos e contestações impedem minimização. Não anexe documentos ou informações de terceiros.</p>
          <button type="submit">{busy ? 'Registrando…' : 'Registrar solicitação'}</button>
        </fieldset>
      </form>
      {protocol && <section aria-label="Protocolo"><p role="status">Protocolo {protocol.id} · {protocol.state === 'Processed' ? 'Processada' : protocol.state === 'Retained' ? 'Retida para revisão' : 'Recebida'}</p>
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { setProtocol(await call(`/api/privacy/requests/${protocol.id}`)); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>Consultar protocolo</button>
        <button type="button" disabled={busy} onClick={() => { setProtocol(null); const id = crypto.randomUUID(); setRequestId(id); try { sessionStorage.setItem(`burger-house-rights-protocol:${proof.orderId}`, id); } catch { /* in-memory recovery */ } }}>Nova solicitação</button>
      </section>}
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try {
        const data = await call(`/api/privacy/orders/${proof.orderId}/export`);
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'meus-dados-do-pedido.json'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>Baixar meus dados deste pedido</button>
    </>}
    <p>Para revogar serviços opcionais deste navegador, use as preferências de privacidade no rodapé da loja. Isso preserva sacola, autenticação e registros sujeitos a retenção.</p>
    <p><a href="/privacy.html">Aviso de privacidade</a> · <a href="/terms.html">Termos</a></p>
  </main></>;
}
