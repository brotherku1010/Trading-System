import { sampleCorrelation, quantileSorted, mean, standardDeviation } from 'simple-statistics';
import { RSI, MACD } from 'technicalindicators';
import Papa from 'papaparse';
import { FACTORS, ASSETS, REGIMES, MACRO } from './catalog.js';

export function normalizeBars(bars, now = Date.now(), allowNonpositive = false) {
  const seen = new Set();
  const today = new Date(now).toISOString().slice(0, 10);
  return (Array.isArray(bars) ? bars : []).filter(bar => {
    const date = bar?.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date >= today) return false;
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return false;
    if (!Number.isFinite(bar.close) || (!allowNonpositive && bar.close <= 0) || seen.has(date)) return false;
    seen.add(date);
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function parseHistoryCsv(text, now = Date.now()) {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
  if (parsed.errors.length) throw new Error('CSV 格式錯誤，請檢查分隔符號與欄位數。');
  if (!['date', 'asset', 'close'].every(key => parsed.meta.fields.includes(key))) throw new Error('CSV 必須包含 date,asset,close 欄位。');
  if (parsed.data.length > 100000) throw new Error('最多匯入 100,000 筆日資料。');
  const history = {};
  const seen = new Set();
  for (const row of parsed.data) {
    const id = row.asset?.trim();
    const date = row.date?.trim();
    const close = Number(row.close);
    if (!ASSETS.some(asset => asset.id === id)) throw new Error(`未知品項：${id}`);
    const bars = normalizeBars([{ date, close }], now, FACTORS.find(f => f.id === id)?.kind === 'yield');
    if (!bars.length || !row.close.trim()) throw new Error(`無效或尚未收盤的資料：${id} ${date}`);
    const key = `${id}:${date}`;
    if (seen.has(key)) throw new Error(`重複日期：${key}`);
    seen.add(key);
    (history[id] ??= { bars: [], source: '使用者 CSV（日資料；收盤時區由使用者確認）', imported: true }).bars.push(bars[0]);
  }
  for (const series of Object.values(history)) series.bars.sort((a, b) => a.date.localeCompare(b.date));
  if (!history.GOLD) throw new Error('需要 GOLD 黃金現貨日收盤資料。');
  return history;
}

function change(current, previous, factor) {
  return factor?.kind === 'yield' ? (current - previous) * 100 : (current / previous - 1) * 100;
}

// Align both interval endpoints: never compare a weekend crypto return with a multi-day gold return.
export function pairedReturns(goldBars, factorBars, factor, window = 252) {
  const gold = normalizeBars(goldBars);
  const index = new Map(normalizeBars(factorBars, Date.now(), factor?.kind === 'yield').map(b => [b.date, b.close]));
  const pairs = [];
  for (let i = 1; i < gold.length; i++) {
    const prev = gold[i - 1], current = gold[i];
    if (!index.has(prev.date) || !index.has(current.date)) continue;
    pairs.push({ date: current.date, gold: change(current.close, prev.close), factor: change(index.get(current.date), index.get(prev.date), factor) });
  }
  return pairs.slice(-window);
}

export function correlation(history, id, window = 252) {
  const factor = FACTORS.find(item => item.id === id);
  const pairs = pairedReturns(history.GOLD?.bars, history[id]?.bars, factor, window);
  let value = null;
  if (pairs.length >= 30) {
    const coefficient = sampleCorrelation(pairs.map(p => p.gold), pairs.map(p => p.factor));
    if (Number.isFinite(coefficient)) value = Math.max(-1, Math.min(1, coefficient));
  }
  return { value, n: pairs.length, start: pairs[0]?.date, end: pairs.at(-1)?.date };
}

export function scenarioScore(directions, regime = 'normal', strength = 1) {
  const config = REGIMES[regime] || REGIMES.normal;
  const contributions = [];
  const groupCounts = {};
  for (const factor of FACTORS) if ([-1, 1].includes(directions[factor.id])) groupCounts[factor.group] = (groupCounts[factor.group] || 0) + 1;
  for (const factor of FACTORS) {
    const direction = [-1, 1].includes(directions[factor.id]) ? directions[factor.id] : 0;
    if (!direction) continue;
    let weight = factor.weight;
    if (['haven', 'centralbank'].includes(regime) && factor.id === 'DXY') weight *= 0.25;
    if (regime === 'liquidity' && factor.group === '風險資產') weight = Math.abs(weight);
    if (regime === 'inflation' && factor.id === 'WTI') weight = 1;
    const contribution = direction * weight * Math.max(0.5, Math.min(2, Number(strength) || 1)) / groupCounts[factor.group];
    contributions.push({ ...factor, direction, contribution });
  }
  const total = contributions.reduce((sum, item) => sum + item.contribution, 0) + config.bias;
  const label = total > 1 ? '偏多情境' : total < -1 ? '偏空情境' : '方向分歧';
  return { total, label, contributions, regime: config, assumptionOnly: true };
}

export function wilson(successes, n) {
  if (!n) return null;
  const z = 1.96, p = successes / n, divisor = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / divisor;
  const radius = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / divisor;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

export function conditionalStudy(history, directions, { window = 252, horizon = 1, threshold = 0.1 } = {}) {
  horizon = [1, 5].includes(horizon) ? horizon : 1;
  const ids = FACTORS.filter(f => [-1, 1].includes(directions[f.id])).map(f => f.id);
  const missing = ids.filter(id => !history[id]?.bars?.length);
  const gold = normalizeBars(history.GOLD?.bars);
  if (!ids.length || missing.length || gold.length < 3) return { n: 0, probability: null, missing, reason: !ids.length ? '尚未設定品項方向' : '缺少黃金或所選品項歷史資料' };
  const maps = Object.fromEntries(ids.map(id => [id, new Map(pairedReturns(gold, history[id].bars, FACTORS.find(f => f.id === id), window).map(p => [p.date, p.factor]))]));
  const outcomes = [];
  let lastUsed = -Infinity;
  let eligible = 0;
  for (let i = Math.max(1, gold.length - window); i + horizon < gold.length; i++) {
    if (!ids.every(id => maps[id].has(gold[i].date))) continue;
    eligible++;
    const matches = ids.every(id => {
      const value = maps[id].get(gold[i].date);
      const cutoff = FACTORS.find(f => f.id === id)?.kind === 'yield' ? threshold * 10 : threshold;
      return directions[id] > 0 ? value > cutoff : value < -cutoff;
    });
    if (!matches || i < lastUsed + horizon) continue;
    outcomes.push((gold[i + horizon].close / gold[i].close - 1) * 100);
    lastUsed = i;
  }
  const n = outcomes.length;
  if (n < 30) return { n, eligible, probability: null, missing, reason: '相符樣本少於 30，不顯示機率與價格推估' };
  const sorted = [...outcomes].sort((a, b) => a - b);
  const positive = outcomes.filter(value => value > 0).length;
  return { n, eligible, missing, probability: positive / n, interval: wilson(positive, n), median: quantileSorted(sorted, 0.5), range: [quantileSorted(sorted, 0.1), quantileSorted(sorted, 0.9)], start: gold[Math.max(1, gold.length - window)].date, end: gold.at(-1).date, horizon };
}

export function technicalSummary(bars) {
  const data = normalizeBars(bars);
  if (data.length < 30) return null;
  const values = data.map(b => b.close);
  const recent = values.slice(-20);
  const returns = values.slice(1).map((value, i) => (value / values[i] - 1) * 100);
  const rsi = RSI.calculate({ values, period: 14 }).at(-1);
  const macd = MACD.calculate({ values, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }).at(-1);
  return { n: data.length, start: data[0].date, end: data.at(-1).date, rsi, macd: macd?.histogram ?? null, low: Math.min(...recent), high: Math.max(...recent), average: mean(recent), dailyVol: standardDeviation(returns.slice(-20)) };
}

export function projectionRange(study, quote, historyEnd, now = Date.now()) {
  const quoteTime = Date.parse(quote?.asOf), historyTime = Date.parse(historyEnd);
  if (!Number.isFinite(study?.n) || study.n < 30 || !Number.isFinite(study?.probability) || !Array.isArray(study.range) || study.range.length !== 2 || !study.range.every(Number.isFinite)) return null;
  if (!Number.isFinite(quoteTime) || !Number.isFinite(historyTime) || !(quote?.price > 0) || quote.refreshFailed) return null;
  if (now - quoteTime > 120000 || quoteTime > now + 60000 || now - historyTime > 7 * 86400000 || historyTime > now) return null;
  if (study.range[0] <= -100 || study.range[0] > study.range[1]) return null;
  return study.range.map(percent => quote.price * (1 + percent / 100));
}

export function macroSurprise(id, actual, forecast) {
  const event = MACRO.find(item => item.id === id);
  if (!event || actual === '' || forecast === '' || !Number.isFinite(Number(actual)) || !Number.isFinite(Number(forecast))) return null;
  const difference = Number(actual) - Number(forecast);
  const impact = difference === 0 ? 0 : Math.sign(difference) * event.sign;
  return { difference, impact, label: impact > 0 ? '一般情境偏支持黃金' : impact < 0 ? '一般情境偏壓抑黃金' : '符合預期，無單一方向訊號', event };
}

export function marketSessions(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return [];
  const hour = zone => Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(date));
  const sessions = [];
  if (hour('Asia/Tokyo') >= 9 && hour('Asia/Tokyo') < 18) sessions.push('亞盤');
  if (hour('Europe/London') >= 8 && hour('Europe/London') < 17) sessions.push('歐盤');
  if (hour('America/New_York') >= 8 && hour('America/New_York') < 17) sessions.push('美盤');
  return sessions.length ? sessions : ['盤間'];
}
