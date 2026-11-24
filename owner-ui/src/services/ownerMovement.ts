import { adminRequest } from './adminHttp';

export interface OrderMovement {
  start: string;
  end: string;
  today: string;
  hours: { date: string; hour: number; count: number }[];
  schedule: { enabled: boolean; start: string | null; end: string | null } | null;
}

export function loadOrderMovement(month: string | undefined, channel: string | undefined, signal: AbortSignal) {
  const query = new URLSearchParams();
  if (month) query.set('month', month);
  if (channel) query.set('channel', channel);
  return adminRequest<OrderMovement>(`/api/admin/orders/movement${query.size ? '?' + query : ''}`, { signal });
}

const longDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' });
const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
export const movementDay = (value: string) => new Date(value + 'T00:00:00Z');
export const movementDateLabel = (value: string) => shortDate.format(movementDay(value));
export const movementMonthLabel = (value: string) => monthName.format(movementDay(value + '-01'));
export function adjacentMonth(value: string, step: number) {
  const date = movementDay(value + '-01');
  date.setUTCMonth(date.getUTCMonth() + step);
  return date.toISOString().slice(0, 7);
}

export interface MovementCell {
  label: string;
  title: string;
  count: number;
  future?: boolean;
  peak?: string;
}

const hourMark = (hour: number) => `${String(hour % 24).padStart(2, '0')}h`;
const weekColumn = (date: Date) => (date.getUTCDay() + 6) % 7;
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function movementByWeekday(report: OrderMovement) {
  const bands = Array.from({ length: 8 }, (_, index) => {
    const hour = index * 3;
    return {
      label: `${hourMark(hour)}–${hourMark(hour + 3)}`,
      cells: weekdays.map(day => ({ title: `${day} · ${hourMark(hour)}–${hourMark(hour + 3)}`, label: '', count: 0 })),
    };
  });
  for (const point of report.hours)
    bands[Math.floor(point.hour / 3)].cells[weekColumn(movementDay(point.date))].count += point.count;
  const { schedule } = report;
  if (!schedule?.enabled || !schedule.start || !schedule.end) return bands;
  const start = minutes(schedule.start);
  const end = minutes(schedule.end);
  return bands.filter((band, index) => {
    const beforeEnd = index * 180 < end;
    const afterStart = (index + 1) * 180 > start;
    const scheduled = end > start ? beforeEnd && afterStart : beforeEnd || afterStart;
    return scheduled || band.cells.some(cell => cell.count > 0);
  });
}

export function movementCalendar(report: OrderMovement): (MovementCell | null)[] {
  const byDay = new Map<string, { count: number; peak: number; peakCount: number }>();
  for (const row of report.hours) {
    const entry = byDay.get(row.date) ?? { count: 0, peak: row.hour, peakCount: 0 };
    entry.count += row.count;
    if (row.count > entry.peakCount || (row.count === entry.peakCount && row.hour < entry.peak)) {
      entry.peak = row.hour;
      entry.peakCount = row.count;
    }
    byDay.set(row.date, entry);
  }
  const start = movementDay(report.start);
  const cells: (MovementCell | null)[] = Array.from({ length: weekColumn(start) }, () => null);
  for (const date = start; date <= movementDay(report.end); date.setUTCDate(date.getUTCDate() + 1)) {
    const id = date.toISOString().slice(0, 10);
    const entry = byDay.get(id);
    cells.push({
      title: longDate.format(date), label: String(date.getUTCDate()),
      count: entry?.count ?? 0, future: id > report.today,
      peak: entry ? `Pico ${hourMark(entry.peak)}–${hourMark(entry.peak + 1)} · ${entry.peakCount}` : undefined,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
