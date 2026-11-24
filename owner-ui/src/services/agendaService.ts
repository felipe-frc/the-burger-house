import { adminRequest } from './adminHttp';

export const AGENDA_CATEGORIES = [
  'Operação',
  'Estoque',
  'Fornecedores',
  'Equipe',
  'Manutenção',
  'Administrativo',
  'Outros',
] as const;

export type AgendaCategory = (typeof AGENDA_CATEGORIES)[number];

export type AgendaEventStatus = 'pending' | 'completed';

export interface AgendaEvent {
  revision?: number;
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD (America/Sao_Paulo)
  startTime: string; // HH:mm 24h
  endTime: string; // HH:mm 24h
  category: AgendaCategory;
  status: AgendaEventStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaEventDraft {
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  category: AgendaCategory;
  notes?: string;
}

export interface AgendaValidationErrors {
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
}

export interface AgendaStorageResult {
  events: AgendaEvent[];
  storageAvailable: boolean;
}

const AGENDA_STORAGE_KEY = 'tbh_demo_agenda_events_v1';
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidCalendarDateKey(value: string): boolean {
  if (!DATE_KEY_REGEX.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValid24HourTime(value: string): boolean {
  return TIME_24H_REGEX.test(value);
}

export function compareTimes24h(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isValidAgendaEvent(raw: unknown): raw is AgendaEvent {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Record<string, unknown>;

  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return false;
  if (typeof candidate.title !== 'string' || !candidate.title.trim()) return false;
  if (typeof candidate.date !== 'string' || !isValidCalendarDateKey(candidate.date))
    return false;
  if (
    typeof candidate.startTime !== 'string' ||
    !isValid24HourTime(candidate.startTime)
  )
    return false;
  if (
    typeof candidate.endTime !== 'string' ||
    !isValid24HourTime(candidate.endTime)
  )
    return false;
  if (compareTimes24h(candidate.endTime, candidate.startTime) <= 0) return false;
  if (
    typeof candidate.category !== 'string' ||
    !(AGENDA_CATEGORIES as readonly string[]).includes(candidate.category)
  )
    return false;
  if (candidate.status !== 'pending' && candidate.status !== 'completed')
    return false;

  if (
    candidate.description !== undefined &&
    typeof candidate.description !== 'string'
  )
    return false;
  if (candidate.notes !== undefined && typeof candidate.notes !== 'string')
    return false;
  if (typeof candidate.createdAt !== 'string' || !candidate.createdAt.trim())
    return false;
  if (typeof candidate.updatedAt !== 'string' || !candidate.updatedAt.trim())
    return false;

  return true;
}

export function validateAgendaDraft(
  draft: AgendaEventDraft
): { isValid: boolean; errors: AgendaValidationErrors } {
  const errors: AgendaValidationErrors = {};

  if (!draft.title.trim()) {
    errors.title = 'Informe o título do compromisso.';
  }
  if (!isValidCalendarDateKey(draft.date)) {
    errors.date = 'Selecione uma data válida.';
  }
  if (!isValid24HourTime(draft.startTime)) {
    errors.startTime = 'Informe o horário inicial (24h).';
  }
  if (!isValid24HourTime(draft.endTime)) {
    errors.endTime = 'Informe o horário de término (24h).';
  } else if (
    isValid24HourTime(draft.startTime) &&
    compareTimes24h(draft.endTime, draft.startTime) <= 0
  ) {
    errors.endTime = 'O horário de término deve ser posterior ao início.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function sortAgendaEvents(events: AgendaEvent[]): AgendaEvent[] {
  return [...events].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const startCmp = a.startTime.localeCompare(b.startTime);
    if (startCmp !== 0) return startCmp;
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  });
}

export function generateAgendaEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `agenda-${crypto.randomUUID()}`;
  }
  return `agenda-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAgendaEvent(
  events: AgendaEvent[],
  draft: AgendaEventDraft,
  nowIso: string = new Date().toISOString()
): { events: AgendaEvent[]; created: AgendaEvent } {
  const created: AgendaEvent = {
    id: generateAgendaEventId(),
    title: draft.title.trim(),
    description: draft.description?.trim() || undefined,
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    category: draft.category,
    status: 'pending',
    notes: draft.notes?.trim() || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return {
    events: sortAgendaEvents([...events, created]),
    created,
  };
}

export function loadDemoAgendaEvents(): AgendaStorageResult {
  let raw: string | null = null;
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { events: [], storageAvailable: false };
    }
    raw = window.localStorage.getItem(AGENDA_STORAGE_KEY);
  } catch {
    return { events: [], storageAvailable: false };
  }

  if (!raw) {
    return { events: [], storageAvailable: true };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { events: [], storageAvailable: true };
    }
    const validated = parsed.filter(isValidAgendaEvent);
    return {
      events: sortAgendaEvents(validated),
      storageAvailable: true,
    };
  } catch {
    return { events: [], storageAvailable: true };
  }
}

export function loadAgendaEvents(start: string, end: string, signal?: AbortSignal): Promise<AgendaEvent[]> {
  return adminRequest(`/api/admin/agenda?${new URLSearchParams({ start, end })}`, { signal });
}

export function persistAgendaEvent(event: AgendaEvent): Promise<AgendaEvent> {
  const draft = { title: event.title, description: event.description, date: event.date,
    startTime: event.startTime, endTime: event.endTime, category: event.category,
    status: event.status, notes: event.notes };
  return event.revision == null
    ? adminRequest('/api/admin/agenda', { method: 'POST', body: JSON.stringify({ id: event.id, draft }) })
    : adminRequest(`/api/admin/agenda/${encodeURIComponent(event.id)}`, {
        method: 'PUT', body: JSON.stringify({ revision: event.revision, draft }),
      });
}

export function deletePersistedAgendaEvent(event: AgendaEvent): Promise<void> {
  if (!event.revision) throw new Error('Recarregue o compromisso antes de remover.');
  return adminRequest(`/api/admin/agenda/${encodeURIComponent(event.id)}?revision=${event.revision}`, { method: 'DELETE' });
}
