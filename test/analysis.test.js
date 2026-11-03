import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBars, parseHistoryCsv, pairedReturns, correlation, scenarioScore, conditionalStudy, technicalSummary, projectionRange, macroSurprise, marketSessions, wilson } from '../lib/analysis.js';
import { FACTORS } from '../lib/catalog.js';

function series(n, growth = i => i % 2 ? 0.01 : -0.005) {
  let price = 100;
  return Array.from({ length: n }, (_, i) => {
    price *= 1 + growth(i);
    return { date: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), close: price };
  });
}

test('normalization rejects unfinished, invalid, nonpositive and duplicate price bars', () => {
  const bars = [{ date: '2020-01-01', close: 100 }, { date: '2020-01-01', close: 200 }, { date: '2020-02-30', close: 1 }, { date: '2020-99-99', close: 1 }, { date: '2030-01-01', close: 1 }, { date: '2020-01-03', close: 0 }];
  assert.deepEqual(normalizeBars(bars, Date.UTC(2021, 0, 1)), [bars[0]]);
  assert.equal(normalizeBars([{ date: '2020-01-01', close: -0.5 }], Date.UTC(2021, 0, 1), true).length, 1);
});
test('CSV uses parser and accepts negative real yields but rejects unknown symbols and duplicate dates', () => {
  const data = parseHistoryCsv('\uFEFFdate,asset,close\n2020-01-01,GOLD,1500\n2020-01-01,REAL10Y,-0.5');
  assert.equal(data.REAL10Y.bars[0].close, -0.5);
  assert.throws(() => parseHistoryCsv('date,asset,close\n2020-01-01,FAKE,4'), /未知/);
  assert.throws(() => parseHistoryCsv('date,asset,close\n2020-01-01,GOLD,4\n2020-01-01,GOLD,5'), /重複/);
  assert.throws(() => parseHistoryCsv('date,asset,close\n2020-01-01,GOLD,'), /無效/);
});
test('paired returns require both interval endpoints; no forward fill of missing dates', () => {
  const gold = [{ date: '2020-01-03', close: 100 }, { date: '2020-01-06', close: 110 }, { date: '2020-01-07', close: 121 }];
  const factor = [{ date: '2020-01-03', close: 10 }, { date: '2020-01-04', close: 20 }, { date: '2020-01-06', close: 11 }];
  const pairs = pairedReturns(gold, factor);
  assert.equal(pairs.length, 1);
  assert.ok(Math.abs(pairs[0].factor - 10) < 1e-8);
});
test('yields are converted to bp changes, including zero/negative values', () => {
  const gold = series(2);
  const yields = gold.map((bar, i) => ({ date: bar.date, close: -0.1 + i * 0.2 }));
  assert.equal(pairedReturns(gold, yields, FACTORS.find(f => f.id === 'REAL10Y'))[0].factor, 20);
});
test('correlation uses returns, minimum sample and handles constant series', () => {
  const bars = series(100);
  assert.ok(correlation({ GOLD: { bars }, DXY: { bars } }, 'DXY').value > 0.9999);
  assert.equal(correlation({ GOLD: { bars: bars.slice(0, 20) }, DXY: { bars } }, 'DXY').value, null);
  assert.equal(correlation({ GOLD: { bars }, DXY: { bars: bars.map(b => ({ ...b, close: 100 })) } }, 'DXY').value, null);
});
test('DXY and real yields typically oppose gold; a haven regime can override DXY pressure', () => {
  assert.ok(scenarioScore({ DXY: 1 }).total < 0);
  assert.ok(scenarioScore({ REAL10Y: -1 }).total > 0);
  assert.ok(scenarioScore({ DXY: 1 }, 'haven').total > 0);
  assert.equal(scenarioScore({}).total, 0);
  assert.equal(scenarioScore({ DXY: 100 }).contributions.length, 0);
  assert.equal(scenarioScore({ DXY: 1 }).assumptionOnly, true);
});
test('same-group factors are averaged to reduce double counting', () => {
  assert.ok(Math.abs(scenarioScore({ US10Y: 1, REAL10Y: 1, BOND: -1 }).total + 2) < 1e-12);
});
test('no fabricated conditional probability when history or samples are missing', () => {
  assert.equal(conditionalStudy({}, { DXY: 1 }).probability, null);
  const bars = series(20);
  assert.equal(conditionalStudy({ GOLD: { bars }, DXY: { bars } }, { DXY: 1 }).probability, null);
  const missing = conditionalStudy({ GOLD: { bars } }, { WTI: -1 });
  assert.deepEqual(missing.missing, ['WTI']);
});
test('conditional study uses subsequent returns, not the contemporaneous correlation', () => {
  const bars = series(160, i => i % 2 ? 0.01 : -0.01);
  const study = conditionalStudy({ GOLD: { bars }, DXY: { bars } }, { DXY: 1 });
  assert.ok(study.n >= 30);
  assert.equal(study.probability, 0);
  assert.ok(study.median < 0);
});
test('five-day outcomes are nonoverlapping and require complete future bars', () => {
  const bars = series(200, i => 0.005 + (i % 3) * 0.001);
  const study = conditionalStudy({ GOLD: { bars }, DXY: { bars } }, { DXY: 1 }, { horizon: 5 });
  assert.equal(study.n, 39);
  assert.equal(study.probability, 1);
});
test('Wilson bounds are finite and contained in zero to one', () => {
  for (const n of [1, 30, 100]) for (const wins of [0, n]) {
    const bounds = wilson(wins, n); assert.ok(bounds[0] >= 0 && bounds[1] <= 1);
  }
  assert.equal(wilson(0, 0), null);
});
test('technical values come from closing history; insufficient data returns null', () => {
  assert.equal(technicalSummary(series(10)), null);
  const bars = series(100, () => 0.01), summary = technicalSummary(bars);
  assert.equal(summary.rsi, 100);
  assert.equal(summary.low, bars.at(-20).close);
  assert.equal(summary.high, bars.at(-1).close);
});
test('macro uses actual minus consensus, with distinct unemployment direction', () => {
  assert.equal(macroSurprise('CPI', 3.5, 3).impact, -1);
  assert.equal(macroSurprise('UNEMP', 4.5, 4).impact, 1);
  assert.equal(macroSurprise('NFP', 100, 100).impact, 0);
  assert.equal(macroSurprise('CPI', '', 3), null);
});
test('session conversion uses DST-aware NY and London local clocks', () => {
  assert.ok(marketSessions('2026-07-01T12:30:00Z').includes('美盤'));
  assert.ok(!marketSessions('2026-01-05T12:30:00Z').includes('美盤'));
  assert.deepEqual(marketSessions('bad date'), []);
});

test('old history cannot generate a current-price projection', () => {
  const now = Date.UTC(2026, 10, 3);
  assert.equal(projectionRange({ n: 100, probability: 0.6, range: [-1, 1] }, { price: 2000, asOf: new Date(now).toISOString() }, '2020-01-01', now), null);
});
test('stale, missing, future or failed quote cannot generate a price projection', () => {
  const now = Date.UTC(2026, 10, 3), study = { n: 100, probability: 0.6, range: [-1, 1] };
  for (const quote of [{ price: null }, { price: 2000, asOf: '2020-01-01' }, { price: 2000, asOf: '2027-01-01' }, { price: 2000, asOf: new Date(now).toISOString(), refreshFailed: true }]) assert.equal(projectionRange(study, quote, '2026-11-02', now), null);
});
test('a sufficiently sampled, recent projection is a mechanical percentage mapping only', () => {
  const now = Date.UTC(2026, 10, 3), quote = { price: 2000, asOf: new Date(now).toISOString() };
  assert.deepEqual(projectionRange({ n: 100, probability: 0.6, range: [-1, 2] }, quote, '2026-11-02', now), [1980, 2040]);
  assert.equal(projectionRange({ n: 29, probability: null }, quote, '2026-11-02', now), null);
});
