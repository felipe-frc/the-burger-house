import { adminRequest } from './adminHttp';

export interface TeamRecord {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
  shift: string;
  active: boolean;
  revision: number;
}
export type TeamDraft = Omit<TeamRecord, 'id'>;
export interface TeamPageResult { items: TeamRecord[]; total: number; page: number; pageSize: number }

export function loadTeam(search: string, active: string, page: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ search, page: String(page) });
  if (active !== 'all') query.set('active', active);
  return adminRequest<TeamPageResult>(`/api/admin/team?${query}`, { signal });
}

export function saveTeam(draft: TeamDraft, id?: number) {
  return adminRequest<TeamRecord>(id === undefined ? '/api/admin/team' : `/api/admin/team/${id}`, {
    method: id === undefined ? 'POST' : 'PUT', body: JSON.stringify(draft),
  });
}
