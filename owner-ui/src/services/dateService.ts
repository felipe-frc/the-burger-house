import { ownerNow } from './ownerShowcase';

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export const OPERATIONAL_TIMEZONE = 'America/Sao_Paulo';

const saoPauloPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: OPERATIONAL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const compactDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const shortDayMonthFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
});

const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

function toUtcNoonDate(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12, 0, 0));
}

/**
 * Obtém a data operacional atual considerando explicitamente o fuso horário America/Sao_Paulo,
 * evitando deslocamento de dia causado por horário UTC ou fuso local divergente.
 */
export function getOperationalToday(now: Date = new Date(ownerNow())): CalendarDate {
  const parts = saoPauloPartsFormatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return { year, month, day };
}

export function isSameCalendarDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function toIsoCalendarKey(date: CalendarDate): string {
  const m = String(date.month).padStart(2, '0');
  const d = String(date.day).padStart(2, '0');
  return `${date.year}-${m}-${d}`;
}

export function formatCompactOperationalDate(date: CalendarDate): string {
  // Ex.: "13 nov. 2026"
  return compactDateFormatter
    .format(toUtcNoonDate(date))
    .replace(/\s+de\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatShortDayMonth(date: CalendarDate): string {
  return shortDayMonthFormatter.format(toUtcNoonDate(date));
}

export function formatFullOperationalDate(date: CalendarDate): string {
  const raw = fullDateFormatter.format(toUtcNoonDate(date));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function formatMonthYearTitle(year: number, month: number): string {
  const raw = monthYearFormatter.format(new Date(Date.UTC(year, month - 1, 15, 12, 0, 0)));
  const cleaned = raw.replace(/\s+de\s+/gi, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function addMonthsToView(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1, 12, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
  };
}

export function addDaysToCalendarDate(date: CalendarDate, deltaDays: number): CalendarDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + deltaDays, 12, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export interface CalendarCell {
  date: CalendarDate;
  inCurrentMonth: boolean;
}

/**
 * Gera grade fixa de 42 células (6 semanas x 7 dias, iniciando no domingo)
 * para manter a altura do popover de calendário estável em qualquer mês.
 */
export function getMonthGridCells(year: number, month: number): CalendarCell[] {
  const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const startWeekday = firstDayOfMonth.getUTCDay(); // 0 = Domingo
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - startWeekday, 12, 0, 0));

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const current = new Date(gridStart.getTime());
    current.setUTCDate(gridStart.getUTCDate() + i);
    const cellYear = current.getUTCFullYear();
    const cellMonth = current.getUTCMonth() + 1;
    const cellDay = current.getUTCDate();
    cells.push({
      date: { year: cellYear, month: cellMonth, day: cellDay },
      inCurrentMonth: cellYear === year && cellMonth === month,
    });
  }
  return cells;
}
