import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { BrandIdentity } from '../components/common/BrandIdentity';

export default function CourierTrackingPage({ orderId }: { orderId: string }) {
  const [token] = useState(() => window.location.hash.slice(1));
  const [sharing, setSharing] = useState(false);
  const [feedback, setFeedback] = useState('Compartilhe apenas durante a entrega. Mantenha esta página aberta.');
  const [ended, setEnded] = useState(false);
  const watch = useRef<number | null>(null);
  const sending = useRef<AbortController | null>(null);
  const run = useRef<string | null>(null);
  const lastSent = useRef(0);
  const endpoint = `/api/courier/tracking/${orderId}`;
  const usable = /^[a-f0-9]{64}$/i.test(token);

  function stopLocal() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    sending.current?.abort();
    sending.current = null;
    run.current = null;
  }

  async function stopRemote() {
    try {
      const response = await fetch(endpoint, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
        credentials: 'omit', cache: 'no-store', keepalive: true });
      return response.ok || [401, 410].includes(response.status);
    } catch { return false; }
  }

  useEffect(() => {
    history.replaceState(history.state, '', window.location.pathname);
    function suspend() {
      if (watch.current === null) return;
      stopLocal();
      setSharing(false);
      setFeedback(navigator.onLine ? 'Compartilhamento interrompido quando a página saiu do primeiro plano.' : 'Sem conexão. O compartilhamento foi interrompido neste aparelho.');
      void stopRemote();
    }
    const visibility = () => { if (document.hidden) suspend(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('offline', suspend);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('offline', suspend);
      stopLocal();
    };
  }, [endpoint, token]);

  function start() {
    if (!navigator.geolocation || !window.isSecureContext) { setFeedback('A localização precisa de HTTPS e de um navegador compatível.'); return; }
    if (!navigator.onLine) { setFeedback('Sem conexão. Reconecte e inicie novamente.'); return; }
    if (!usable || ended || watch.current !== null) return;
    setSharing(true);
    setFeedback('Aguardando autorização e uma posição do aparelho…');
    watch.current = navigator.geolocation.watchPosition(async position => {
      if (watch.current === null || sending.current || Date.now() - lastSent.current < 10_000) return;
      const abort = new AbortController();
      sending.current = abort;
      lastSent.current = Date.now();
      try {
        if (!run.current) {
          const accepted = await fetch(endpoint, { method: 'POST', credentials: 'omit', cache: 'no-store', signal: abort.signal,
            headers: { Authorization: `Bearer ${token}` } });
          if (accepted.status === 401) {
            stopLocal(); setSharing(false); setEnded(true); setFeedback('O acesso foi revogado ou a entrega terminou.');
            return;
          }
          if (!accepted.ok) { setFeedback('Não foi possível ativar o compartilhamento.'); return; }
          const { runId } = await accepted.json() as { runId: string };
          if (abort.signal.aborted) return;
          run.current = runId;
        }
        const response = await fetch(endpoint, {
          method: 'PUT', credentials: 'omit', cache: 'no-store', signal: abort.signal,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude,
            accuracy: position.coords.accuracy, fixTime: new Date(position.timestamp).toISOString(), runId: run.current }),
        });
        if (abort.signal.aborted) return;
        if ([401, 410].includes(response.status)) {
          stopLocal(); setSharing(false); setEnded(true); setFeedback('O acesso foi revogado ou a entrega terminou.');
        } else if (response.ok) setFeedback('Posição recebida pelo painel.');
        else if (response.status !== 429) setFeedback('Posição não aceita. Aguarde uma nova leitura do aparelho.');
      } catch {
        if (!abort.signal.aborted) setFeedback('Falha no envio. Aguarde outra posição ou interrompa o compartilhamento.');
      } finally { if (sending.current === abort) sending.current = null; }
    }, error => {
      setFeedback(error.code === error.PERMISSION_DENIED ? 'Permissão negada. Libere a localização nas configurações do navegador.' : 'O aparelho não encontrou uma posição. Verifique o sinal e tente novamente.');
      stopLocal(); setSharing(false); void stopRemote();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }

  return <main className="min-h-dvh px-4 py-8 grid content-center">
    <section className="owner-panel space-y-4 p-5 w-full max-w-md mx-auto">
      <BrandIdentity variant="sidebar" />
      <h1 className="owner-title">Localização da entrega #{orderId}</h1>
      <p>A sua localização será enviada ao Owner enquanto você compartilhar neste aparelho.</p>
      <p role="status" className="owner-muted">{usable ? feedback : 'Abra o link privado fornecido para esta entrega.'}</p>
      {usable && !ended && (sharing
        ? <button className="owner-button owner-button-critical" onClick={async () => {
          stopLocal(); setSharing(false);
          setFeedback(await stopRemote() ? 'Compartilhamento interrompido.' : 'Compartilhamento local interrompido. A última posição expirará no painel.');
        }}>Interromper compartilhamento</button>
        : <button className="owner-button owner-primary" onClick={start}><MapPin size={17} aria-hidden="true" /> Compartilhar minha localização</button>)}
    </section>
  </main>;
}
