import { useEffect, useRef, useState } from 'react';
import { showcaseEnabled } from './ownerShowcase';
import { loadAgendaEvents, loadDemoAgendaEvents, type AgendaEvent } from './agendaService';

/** Owns API synchronization and the mutation lock independently of the calendar/form view. */
export function useAgendaData(isOpen: boolean, start: string, end: string) {
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [legacyEvents, setLegacyEvents] = useState<AgendaEvent[]>([]);
  const [mutating, setMutating] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    let timer: number;
    let running = false;
    setLegacyEvents(showcaseEnabled() ? [] : loadDemoAgendaEvents().events);
    setLoading(true);
    const load = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      try {
        const rows = await loadAgendaEvents(start, end, controller.signal);
        if (!controller.signal.aborted) { setEvents(rows); setRequestError(''); }
      } catch (error) {
        if (!controller.signal.aborted) setRequestError(error instanceof Error ? error.message : 'Falha ao consultar agenda.');
      } finally {
        running = false;
        if (!controller.signal.aborted) { setLoading(false); timer = window.setTimeout(load, 15000); }
      }
    };
    const reconnect = () => { window.clearTimeout(timer); void load(); };
    void load();
    window.addEventListener('online', reconnect);
    return () => { controller.abort(); window.clearTimeout(timer); window.removeEventListener('online', reconnect); };
  }, [isOpen, start, end, refresh]);

  const mutate = async (operation: () => Promise<unknown>) => {
    if (isSubmittingRef.current || loading) return false;
    isSubmittingRef.current = true;
    setMutating(true);
    setRequestError('');
    try {
      await operation();
      setRefresh(value => value + 1);
      return true;
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Não foi possível salvar.');
      return false;
    } finally { isSubmittingRef.current = false; setMutating(false); }
  };

  return { events, loading, requestError, legacyEvents, mutating, mutate, retry: () => setRefresh(value => value + 1) };
}
