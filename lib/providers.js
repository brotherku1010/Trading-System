import { XMLParser } from 'fast-xml-parser';
import Papa from 'papaparse';
import { ASSETS } from './catalog.js';
import { normalizeBars } from './analysis.js';

const memory = new Map();
export function clearProviderCache() { memory.clear(); }
const serviceError = (message, status = 502) => Object.assign(new Error(message), { safeMessage: message, status });

export async function requestJson(url, options = {}, timeout = 9000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw serviceError(`上游服務回應 HTTP ${response.status}，未以替代數字補值。`);
  const data = await response.json();
  if (data?.status === 'error' || data?.code >= 400) throw serviceError(`上游拒絕要求（${data.code || 'API'}）；請檢查商品權限、代號與額度。`);
  return data;
}

async function cached(key, seconds, load) {
  const current = memory.get(key);
  if (current && Date.now() < current.until) return current.value;
  const cacheKey = new Request(`https://paw-cache.internal/v2/${encodeURIComponent(key)}`);
  const edge = typeof caches !== 'undefined' ? caches.default : null;
  if (edge) {
    try { const response = await edge.match(cacheKey); if (response) return await response.json(); } catch { /* Cache failure must not prevent a source request. */ }
  }
  if (memory.size > 150) memory.clear();
  const value = await load();
  memory.set(key, { value, until: Date.now() + seconds * 1000 });
  if (edge) {
    try { await edge.put(cacheKey, Response.json(value, { headers: { 'Cache-Control': `public, max-age=${seconds}` } })); } catch { /* Local memory remains the fallback cache. */ }
  }
  return value;
}
const number = value => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const unavailable = (asset, reason) => ({ asset: asset.id, symbol: asset.symbol, unit: asset.unit, price: null, asOf: null, status: 'unavailable', reason });

export function quoteStatus(asOf, daily = false, now = Date.now()) {
  const timestamp = Date.parse(asOf);
  if (!Number.isFinite(timestamp) || timestamp > now + 60000) return 'unknown-time';
  if (daily) return now - timestamp > 7 * 86400000 ? 'stale' : 'daily';
  return now - timestamp > 120000 ? 'stale' : 'recent';
}

async function fredHistory(asset) {
  return cached(`fred:${asset.id}`, 3600, async () => {
    const start = new Date(Date.now() - 600 * 86400000).toISOString().slice(0, 10);
    const response = await fetch(`https://fred.stlouisfed.org/graph/?id=${asset.symbol}&format=csv&cosd=${start}`, { signal: AbortSignal.timeout(9000) });
    if (!response.ok) throw serviceError('FRED 日資料暫時無法取得');
    const parsed = Papa.parse(await response.text(), { header: true, skipEmptyLines: true });
    const bars = normalizeBars(parsed.data.map(row => ({ date: row.observation_date || row.DATE, close: number(row[asset.symbol]) })), Date.now(), true);
    if (!bars.length) throw serviceError('FRED 未回傳有效日資料');
    return { asset: asset.id, bars, source: `FRED / ${asset.symbol}`, sourceUrl: `https://fred.stlouisfed.org/series/${asset.symbol}`, frequency: 'daily', boundary: '美國營業日日資料，非盤中報價', fetchedAt: new Date().toISOString() };
  });
}

function providerSymbol(asset, env) {
  let overrides = {};
  try { overrides = JSON.parse(env.MARKET_SYMBOLS_JSON || '{}'); } catch { throw serviceError('MARKET_SYMBOLS_JSON 不是有效 JSON', 503); }
  const symbol = overrides[asset.id] || asset.symbol;
  if (typeof symbol !== 'string' || symbol.length > 64) throw serviceError('商品代號設定無效', 503);
  return symbol;
}

export async function getQuote(asset, env = {}) {
  try {
    if (['GOLD', 'SILVER'].includes(asset.id)) return await cached(`gold:${asset.id}`, 30, async () => {
      const data = await requestJson(`https://api.gold-api.com/price/${asset.id === 'GOLD' ? 'XAU' : 'XAG'}`);
      const price = number(data.price);
      if (!(price > 0)) throw serviceError('貴金屬來源未提供有效價格');
      const timestamp = Date.parse(data.updatedAt);
      const asOf = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
      return { asset: asset.id, symbol: asset.symbol, unit: asset.unit, price, changePercent: null, asOf, status: quoteStatus(asOf), source: 'Gold API / 指示性現貨', sourceUrl: 'https://gold-api.com/', quoteType: 'spot-indicative', note: '不是券商可成交買／賣價，無 bid/ask；未加價或換算代幣。' };
    });
    if (asset.kind === 'yield') {
      const history = await fredHistory(asset);
      const last = history.bars.at(-1), previous = history.bars.at(-2);
      return { asset: asset.id, symbol: asset.symbol, unit: asset.unit, price: last.close, asOf: `${last.date}T00:00:00Z`, precision: 'date', changeBps: previous ? (last.close - previous.close) * 100 : null, status: quoteStatus(last.date, true), source: history.source, sourceUrl: history.sourceUrl, quoteType: 'daily-yield' };
    }
    if (['BTC', 'ETH'].includes(asset.id)) return await cached(`crypto:${asset.id}`, 30, async () => {
      const data = await requestJson(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${asset.symbol}`);
      const asOf = Number.isFinite(data.closeTime) ? new Date(data.closeTime).toISOString() : null;
      if (!(number(data.lastPrice) > 0)) throw serviceError('交易所未提供有效價格');
      return { asset: asset.id, symbol: asset.symbol, unit: asset.unit, price: number(data.lastPrice), changePercent: number(data.priceChangePercent), high: number(data.highPrice), low: number(data.lowPrice), asOf, status: quoteStatus(asOf), source: 'Binance / 現貨 USDT', sourceUrl: 'https://www.binance.com/', quoteType: 'exchange-spot', note: 'USDT 不等於 USD，24 小時滾動漲跌幅。' };
    });
    if (!env.TWELVE_DATA_API_KEY) return unavailable(asset, '需要 Twelve Data Key 與對應商品權限');
    const symbol = providerSymbol(asset, env);
    return await cached(`tdq:${asset.id}:${symbol}`, 300, async () => {
      const data = await requestJson(`https://api.twelvedata.com/quote?${new URLSearchParams({ symbol, apikey: env.TWELVE_DATA_API_KEY })}`);
      if (!(number(data.close) > 0)) throw serviceError('行情來源未提供有效價格');
      const timestamp = number(data.timestamp);
      const asOf = timestamp ? new Date(timestamp * 1000).toISOString() : null;
      return { asset: asset.id, symbol, unit: asset.unit, price: number(data.close), changePercent: number(data.percent_change), high: number(data.high), low: number(data.low), asOf, status: quoteStatus(asOf), source: `Twelve Data / ${data.exchange || data.name || symbol}`, quoteType: asset.proxy ? 'ETF-proxy' : 'provider-quote', note: '更新頻率與延遲依訂閱及市場狀態；REST 輪詢不是逐筆行情。' };
    });
  } catch (error) { return unavailable(asset, error.safeMessage || '來源連線失敗或逾時，無可用報價'); }
}

export async function getSnapshot(env) {
  const quotes = await Promise.all(ASSETS.map(asset => ['GOLD', 'SILVER', 'BTC', 'ETH', 'US10Y', 'REAL10Y'].includes(asset.id) ? getQuote(asset, env) : unavailable(asset, '待單品項查詢；需要資料服務權限')));
  return { quotes, fetchedAt: new Date().toISOString(), pollingSeconds: 60 };
}

export async function getHistory(asset, env = {}) {
  if (asset.kind === 'yield') return fredHistory(asset);
  if (['BTC', 'ETH'].includes(asset.id)) return cached(`klines:${asset.id}`, 3600, async () => {
    const data = await requestJson(`https://data-api.binance.vision/api/v3/klines?symbol=${asset.symbol}&interval=1d&limit=500`);
    if (!Array.isArray(data)) throw serviceError('交易所歷史資料格式錯誤');
    const bars = normalizeBars(data.filter(row => row[6] < Date.now()).map(row => ({ date: new Date(row[0]).toISOString().slice(0, 10), close: number(row[4]) })));
    if (!bars.length) throw serviceError('無可用已收盤資料');
    return { asset: asset.id, bars, source: 'Binance / USDT 日收盤', sourceUrl: 'https://data-api.binance.vision/', frequency: 'daily', boundary: 'UTC 00:00；與紐約收盤並不完全同步' };
  });
  if (!env.TWELVE_DATA_API_KEY) throw serviceError('歷史日資料需要 Twelve Data Key，或從介面匯入券商 CSV。', 503);
  const symbol = providerSymbol(asset, env);
  return cached(`tdh:${asset.id}:${symbol}`, 3600, async () => {
    const data = await requestJson(`https://api.twelvedata.com/time_series?${new URLSearchParams({ symbol, interval: '1day', outputsize: '1000', timezone: 'UTC', apikey: env.TWELVE_DATA_API_KEY })}`);
    const bars = normalizeBars(data.values?.map(row => ({ date: row.datetime.slice(0, 10), close: number(row.close) })));
    if (!bars.length) throw serviceError('未取得有效已收盤日資料，請檢查訂閱與代號');
    return { asset: asset.id, symbol, bars, source: `Twelve Data / ${symbol}`, sourceUrl: 'https://twelvedata.com/', frequency: 'daily', boundary: `來源時區 ${data.meta?.exchange_timezone || 'UTC'}；跨市場日界線可能不同` };
  });
}

const xmlParser = new XMLParser({ ignoreAttributes: false, processEntities: false, cdataPropName: '__cdata', textNodeName: '__text', parseTagValue: false });
const textValue = value => typeof value === 'string' ? value : value?.__cdata || value?.__text || '';
const array = value => value ? Array.isArray(value) ? value : [value] : [];
const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };

export function parseFeed(xml, source) {
  const feed = xmlParser.parse(xml);
  return array(feed.rss?.channel?.item || feed.feed?.entry).slice(0, 8).map(item => {
    const date = Date.parse(textValue(item.pubDate || item.published || item.updated));
    const link = typeof item.link === 'string' ? item.link : array(item.link).find(link => link['@_rel'] !== 'self')?.['@_href'];
    return { title: textValue(item.title).replace(/&amp;/g, '&').slice(0, 400), url: safeUrl(link), publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null, source };
  }).filter(item => item.title && item.url);
}

export async function getNews() {
  return cached('news', 300, async () => {
    const feeds = [['Federal Reserve', 'https://www.federalreserve.gov/feeds/press_all.xml'], ['ECB', 'https://www.ecb.europa.eu/rss/press.html'], ['動區動趨（媒體）', 'https://www.blocktempo.com/feed/']];
    const items = [], errors = [];
    for (const [source, url] of feeds) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
        if (!response.ok) throw new Error('Feed unavailable');
        const parsed = parseFeed((await response.text()).slice(0, 2000000), source);
        if (!parsed.length) throw new Error('No articles');
        items.push(...parsed);
      } catch { errors.push(`${source} 暫時無法取得`); }
    }
    const unique = [...new Map(items.map(item => [item.url, item])).values()];
    return { items: unique.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, 20), errors, fetchedAt: new Date().toISOString() };
  });
}

export async function getCalendar() {
  return cached('calendar', 1800, async () => {
    const data = await requestJson('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
    if (!Array.isArray(data)) throw serviceError('經濟日曆資料格式錯誤');
    return { source: 'Forex Factory / Fair Economy（第三方日曆，非官方公布值）', sourceUrl: 'https://www.forexfactory.com/calendar', fetchedAt: new Date().toISOString(), events: data.filter(item => item.country === 'USD' && ['High', 'Medium'].includes(item.impact)).map(item => ({ title: String(item.title), date: Number.isFinite(Date.parse(item.date)) ? new Date(item.date).toISOString() : null, impact: item.impact, forecast: String(item.forecast || '—'), previous: String(item.previous || '—'), actual: null })).sort((a, b) => (a.date || '').localeCompare(b.date || '')) };
  });
}
