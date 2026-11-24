import { adminRequest } from './adminHttp';

export interface WorkDay {
  date: string;
  startsAtUtc: string | null;
  endsAtUtc: string | null;
  plannedBreakMinutes: number;
  revision: number;
  plannedMinutes: number | null;
  workedMinutes: number | null;
  extraMinutes: number | null;
  lateMinutes: number | null;
  earlyEntryMinutes: number | null;
  earlyExitMinutes: number | null;
  state: string;
}

export interface TeamJournalEntry {
  id: string;
  kind: string;
  date: string;
  atUtc: string;
  recordedAtUtc: string;
  ownerId: number;
  origin: string;
  replacesId: string | null;
  note: string | null;
  reference: string | null;
  amount: number | null;
  overtimeHourlyRate: number | null;
  status: string | null;
}

export interface TeamOperations {
  days: WorkDay[];
  entries: TeamJournalEntry[];
  workedMinutes: number;
  extraMinutes: number;
  absences: number;
  lateDays: number;
  workedDays: number;
  extraAmount: number | null;
  payPolicy: TeamJournalEntry | null;
}

export interface JournalWrite {
  requestId: string;
  kind: string;
  date: string;
  atLocal?: string;
  note?: string;
  reference?: string;
  replacesId?: string;
  amount?: number;
  overtimeHourlyRate?: number;
  status?: string;
}

export const loadTeamOperations = (id: number, month: string, signal?: AbortSignal) =>
  adminRequest<TeamOperations>(`/api/admin/team/${id}/operations?month=${encodeURIComponent(month + '-01')}`, { signal });

export const saveTeamWorkDay = (id: number, date: string, body: { start: string; end: string; breakMinutes: number; revision: number }) =>
  adminRequest<WorkDay>(`/api/admin/team/${id}/work-days/${encodeURIComponent(date)}`, { method: 'PUT', body: JSON.stringify(body) });

export const appendTeamJournal = (id: number, body: JournalWrite) =>
  adminRequest<TeamJournalEntry>(`/api/admin/team/${id}/journal`, { method: 'POST', body: JSON.stringify(body) });
