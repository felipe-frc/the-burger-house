export type GreetingPeriod = 'morning' | 'afternoon' | 'night';
import { utcInstant } from './ownerPresentation';

export type KpiState = 'neutral' | 'positive' | 'warning' | 'critical';
export interface KpiAppearance { state: KpiState; known: boolean; label?: string; detail?: string }
const unknown = (detail: string): KpiAppearance => ({ state: 'neutral', known: false, label: 'Sem dados', detail });
const classified = (state: KpiState, detail?: string): KpiAppearance => ({ state, known: true,
  label: state === 'warning' ? 'Atenção' : state === 'critical' ? 'Crítico' : undefined, detail });

export function informationalKpiAppearance(value: number | null, state: 'neutral' | 'positive'): KpiAppearance {
  return value != null && Number.isFinite(value) ? classified(state) :
    { ...unknown('Indicador indisponível.'), state };
}

export const pendingPaymentDefaults = Object.freeze({ warningMinutes: 15, criticalMinutes: 30 });

/** The existing review SLA remains authoritative; zero disables age alerts.
 * The V16.2 critical band is twice the attention band (15/30 by default). */
export function pendingPaymentThresholds(hours?: number | null) {
  if (hours == null) return { ...pendingPaymentDefaults, disabled: false };
  if (!Number.isInteger(hours) || hours < 0 || hours > 8760) return null;
  return { warningMinutes: hours * 60, criticalMinutes: hours * 120, disabled: hours === 0 };
}

export function pendingPaymentAppearance(input: {
  count: number | null; oldestCreatedAt: string | null; now: number;
  available: boolean; limitsAvailable: boolean; pendingPaymentAgeHours?: number | null;
}): KpiAppearance {
  if (input.count == null || !Number.isInteger(input.count) || input.count < 0)
    return unknown('Contagem de pagamentos pendentes indisponível.');
  if (input.count === 0) return classified('neutral');
  if (!input.limitsAvailable) return unknown('Limites de pagamento indisponíveis.');
  const limits = pendingPaymentThresholds(input.pendingPaymentAgeHours);
  if (!limits) return unknown('Limite de pagamento inválido.');
  if (limits.disabled) return { state: 'neutral', known: true, label: 'Desativado', detail: 'Alerta por idade desativado nas configurações.' };
  if (!input.available || !input.oldestCreatedAt) return unknown('Início da pendência mais antiga indisponível.');
  const since = utcInstant(input.oldestCreatedAt);
  if (!Number.isFinite(since) || !Number.isFinite(input.now) || since > input.now)
    return unknown('Horário de início da pendência inválido ou no futuro.');
  const age = (input.now - since) / 60000;
  return classified(age > limits.criticalMinutes ? 'critical' : age > limits.warningMinutes ? 'warning' : 'neutral',
    `Pendência mais antiga: ${Math.floor(age)} min. Atenção acima de ${limits.warningMinutes} min; crítico acima de ${limits.criticalMinutes} min.`);
}

/** The restaurant's local clock, independently of the browser's timezone and theme. */
export function overviewGreeting(instant: number) {
  if (!Number.isFinite(instant)) return null;
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hourCycle: 'h23',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(instant);
    const read = (name: string) => Number(parts.find(part => part.type === name)?.value);
    const hour = read('hour'), minute = read('minute'), second = read('second');
    const period: GreetingPeriod = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'night';
    const boundary = hour < 5 ? 5 : hour < 12 ? 12 : hour < 18 ? 18 : 29;
    return {
      period,
      text: period === 'morning' ? 'Bom dia!' : period === 'afternoon' ? 'Boa tarde!' : 'Boa noite!',
      updateAfterMs: (boundary - hour) * 3_600_000 - minute * 60_000 - second * 1000 - ((instant % 1000 + 1000) % 1000),
    };
  } catch {
    return null;
  }
}

/** Presentation only: delays remain classified by the existing operational limits. */
export function kitchenKpiAppearance(delayed: number | null, limit: number | null, measured: number, total: number) {
  if (delayed == null || !Number.isInteger(delayed) || delayed < 0 || limit == null)
    return unknown('Quantidade de atrasados ou limites indisponíveis.');
  if (delayed === 0 && measured < total) return unknown('Há pedidos sem horário confiável para classificar atraso.');
  return classified(delayed >= 3 ? 'critical' : delayed > 0 ? 'warning' : 'neutral',
    measured < total ? 'Há horários incompletos; a classificação considera somente atrasos confirmados.' : undefined);
}
