import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { overviewGreeting, kitchenKpiAppearance, pendingPaymentAppearance, pendingPaymentThresholds, informationalKpiAppearance } from './ownerOverviewAppearance';
import { metallicKpiPath } from './ownerMetallicKpi';

test('greetings follow São Paulo at all boundaries, independently of the UTC day', () => {
  for (const [time, period, text, remaining] of [
    ['04:59:59', 'night', 'Boa noite!', 1000],
    ['05:00:00', 'morning', 'Bom dia!', 7 * 3600000],
    ['11:59:59', 'morning', 'Bom dia!', 1000],
    ['12:00:00', 'afternoon', 'Boa tarde!', 6 * 3600000],
    ['17:59:59', 'afternoon', 'Boa tarde!', 1000],
    ['18:00:00', 'night', 'Boa noite!', 11 * 3600000],
    ['23:59:59', 'night', 'Boa noite!', 5 * 3600000 + 1000],
    ['00:00:00', 'night', 'Boa noite!', 5 * 3600000],
  ] as const) {
    assert.deepEqual(overviewGreeting(Date.parse(`2026-11-18T${time}-03:00`)), { period, text, updateAfterMs: remaining });
  }
  assert.equal(overviewGreeting(Date.parse('2026-11-18T11:59:59.999-03:00'))?.updateAfterMs, 1);
});

test('invalid clock has a discreet fallback without scheduling a timer', () => {
  for (const instant of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) assert.equal(overviewGreeting(instant), null);
});

for (const [count, state] of [[0, 'neutral'], [1, 'warning'], [2, 'warning'], [3, 'critical'], [5, 'critical']] as const) {
  test(`delayed count ${count} selects ${state} without changing the delay rule`, () => {
    const result = kitchenKpiAppearance(count, 180, 5, 5);
    assert.equal(result.state, state);
    assert.equal(result.known, true);
  });
}
test('missing delay evidence is explicit; disabled limits are not a claim that the SLA was met', () => {
  for (const result of [kitchenKpiAppearance(null, 180, 0, 2), kitchenKpiAppearance(0, null, 0, 2), kitchenKpiAppearance(0, 180, 1, 2)]) {
    assert.equal(result.state, 'neutral'); assert.equal(result.known, false); assert.equal(result.label, 'Sem dados');
  }
  assert.equal(kitchenKpiAppearance(0, 0, 2, 2).state, 'neutral');
  assert.equal(kitchenKpiAppearance(3, 180, 3, 5).state, 'critical');
});
const now = Date.parse('2026-11-19T12:00:00Z');
const pending = (minutes: number, hours?: number | null) => pendingPaymentAppearance({ count: 1,
  oldestCreatedAt: new Date(now - minutes * 60000).toISOString(), now, available: true,
  limitsAvailable: true, pendingPaymentAgeHours: hours });
for (const [minutes, state] of [[0, 'neutral'], [15, 'neutral'], [16, 'warning'], [30, 'warning'], [31, 'critical']] as const) {
  test(`oldest payment pending ${minutes} minutes selects ${state}`, () => {
    assert.equal(pending(minutes).state, state); assert.equal(pending(minutes).known, true);
  });
}
test('configured payment review SLA replaces defaults, zero disables, invalid SLA is unknown', () => {
  assert.equal(pending(31, 2).state, 'neutral');
  assert.equal(pending(121, 2).state, 'warning');
  assert.equal(pending(240, 2).state, 'warning');
  assert.equal(pending(241, 2).state, 'critical');
  assert.equal(pending(900, 0).state, 'neutral');
  assert.equal(pending(900, 0).label, 'Desativado');
  for (const limit of [-1, NaN, Infinity, .5, 8761]) assert.equal(pendingPaymentThresholds(limit), null);
  assert.equal(pending(31, -1).known, false);
});
test('missing, invalid, future, unavailable or mismatched payment evidence never becomes critical', () => {
  const input = { count: 1, oldestCreatedAt: null, now, available: true, limitsAvailable: true };
  for (const variant of [input, { ...input, oldestCreatedAt: 'invalid' }, { ...input, oldestCreatedAt: new Date(now + 60000).toISOString() },
    { ...input, count: null }, { ...input, available: false }, { ...input, limitsAvailable: false }]) {
    const result = pendingPaymentAppearance(variant);
    assert.equal(result.known, false); assert.equal(result.state, 'neutral'); assert.equal(result.label, 'Sem dados');
  }
  assert.equal(pendingPaymentAppearance({ ...input, count: 0 }).known, true);
  assert.equal(informationalKpiAppearance(0, 'positive').state, 'positive');
  assert.equal(informationalKpiAppearance(null, 'neutral').known, false);
  assert.equal(pendingPaymentAppearance({ ...input, oldestCreatedAt: '2026-11-19T08:44:00-03:00' }).state, 'warning');
  assert.equal(pendingPaymentAppearance({ ...input, oldestCreatedAt: '2026-11-19T11:44:00' }).state, 'warning');
});

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
test('metallic shoulder has matching Bezier tangents at every card width and both rim contours', () => {
  for (const width of [142, 184, 384]) for (const inset of [2, 5]) {
    const curves = [...metallicKpiPath(width, 190, inset).matchAll(/C ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/g)]
      .map(match => match.slice(1).map(Number));
    assert.equal(curves.length, 2);
    const [enter, leave] = curves;
    assert.deepEqual([enter[4] - enter[2], enter[5] - enter[3]], [leave[0] - enter[4], leave[1] - enter[5]]);
    assert.equal(leave[5] - leave[3], 0);
  }
});
const light = css.match(/\.owner-overview \{([^}]+)\}/)![1];
const dark = css.match(/\.dark \.owner-overview \{([^}]+)\}/)![1];
const token = (block: string, name: string) => block.match(new RegExp(`--kpi-sem-${name}: ([^;]+);`))![1];
const rgb = (hex: string) => hex.match(/[a-f\d]{2}/gi)!.map(component => parseInt(component, 16));
const luminance = (color: number[]) => color.map(value => {
  const channel = value / 255;
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const contrast = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
// Test both extremes of the unchanged SVG reflection, fine brush and dark light layer.
const overlays = [(color: number[]) => mix(color, [255, 255, 255], 1 - .965 * .975),
  (color: number[]) => mix(color, [0, 0, 0], .05)];
for (const [theme, block] of [['light', light], ['dark', dark]]) {
  test(`${theme} four semantic materials meet AA after all metallic overlays`, () => {
    for (const state of ['neutral', 'positive', 'warning', 'critical']) {
      const stops = ['top', 'mid', 'base'].map(role => rgb(token(block, `${state}-${role}`)));
      const texts = ['text', 'support'].map(role => rgb(token(block, `${state}-${role}`)));
      const accent = rgb(token(block, `${state}-accent`));
      for (let segment = 1; segment < stops.length; segment++) for (let n = 0; n <= 100; n++) {
        const surface = mix(stops[segment - 1], stops[segment], n / 100);
        for (const overlay of overlays) {
          for (const text of texts) assert.ok(contrast(text, overlay(surface)) >= 4.5,
            `${theme}/${state} text: ${contrast(text, overlay(surface)).toFixed(2)}:1`);
          assert.ok(contrast(accent, overlay(surface)) >= 3, `${theme}/${state} icon`);
          assert.ok(contrast(accent, mix(overlay(surface), accent, .08)) >= 3, `${theme}/${state} arrow hover`);
        }
      }
    }
  });
}
