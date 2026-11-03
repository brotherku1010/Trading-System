import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuote, getHistory, getNews, getCalendar, quoteStatus, parseFeed, clearProviderCache } from '../lib/providers.js';
import worker from '../worker.js';
import { ASSETS, GOLD } from '../lib/catalog.js';

test.beforeEach(() => clearProviderCache());
test.afterEach(() => { globalThis.fetch = nativeFetch; });
const nativeFetch = globalThis.fetch;
const output = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('gold quote preserves exact source price, symbol and timestamp; never PAXG/offset', async () => {
  let calls = 0;
  globalThis.fetch = async url => { calls++; assert.match(url, /price\/XAU$/); return output({ price: 2345.67, updatedAt: new Date().toISOString() }); };
  const quote = await getQuote(GOLD);
  assert.equal(quote.price, 2345.67); assert.equal(quote.symbol, 'XAU/USD'); assert.equal(quote.changePercent, null);
  await getQuote(GOLD); assert.equal(calls, 1);
});
test('failed upstream reports missing price instead of a hard-coded fallback', async () => {
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  const quote = await getQuote(GOLD);
  assert.equal(quote.price, null); assert.equal(quote.status, 'unavailable');
});
test('missing or future timestamp is not marked fresh', () => {
  const now = Date.UTC(2026, 0, 5);
  assert.equal(quoteStatus(null, false, now), 'unknown-time');
  assert.equal(quoteStatus('2027-01-01', false, now), 'unknown-time');
  assert.equal(quoteStatus('2020-01-01', false, now), 'stale');
});
test('Binance quote is USDT and uses exchange closeTime', async () => {
  globalThis.fetch = async () => output({ lastPrice: '60000', priceChangePercent: '2.5', highPrice: '61000', lowPrice: '59000', closeTime: Date.now() });
  const quote = await getQuote(ASSETS.find(a => a.id === 'BTC'));
  assert.equal(quote.price, 60000); assert.equal(quote.unit, 'USDT / BTC');
});
test('no key means no paid API call; absent history fails explicitly', async () => {
  globalThis.fetch = async () => { throw new Error('Should not call network'); };
  assert.equal((await getQuote(ASSETS.find(a => a.id === 'DXY'))).price, null);
  await assert.rejects(getHistory(GOLD), /Twelve Data/);
});
test('provider error and secret are not reflected into public errors', async () => {
  globalThis.fetch = async () => output({ status: 'error', code: 429, message: 'secret-key-text' });
  const quote = await getQuote(ASSETS.find(a => a.id === 'DXY'), { TWELVE_DATA_API_KEY: 'secret-key-text' });
  assert.equal(quote.price, null); assert.ok(!JSON.stringify(quote).includes('secret-key-text'));
});
test('FRED supports negative real yields, filters missing values, preserves date precision', async () => {
  globalThis.fetch = async () => new Response('observation_date,DFII10\n2020-01-01,-0.2\n2020-01-02,.\n2020-01-03,0.1\n');
  const quote = await getQuote(ASSETS.find(a => a.id === 'REAL10Y'));
  assert.equal(quote.price, 0.1); assert.equal(quote.precision, 'date'); assert.ok(Math.abs(quote.changeBps - 30) < 1e-8);
});
test('RSS handles CDATA, removes unsafe links and keeps actual publication dates', () => {
  const xml = '<rss><channel><item><title><![CDATA[Official <statement>]]></title><link>https://example.com/1</link><pubDate>Wed, 01 Jan 2020 12:00:00 GMT</pubDate></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>';
  const items = parseFeed(xml, 'Official');
  assert.equal(items.length, 1); assert.equal(items[0].title, 'Official <statement>'); assert.equal(items[0].publishedAt, '2020-01-01T12:00:00.000Z');
});
test('all failed feeds produce zero articles, not fabricated current news', async () => {
  globalThis.fetch = async () => new Response('', { status: 503 });
  const news = await getNews(); assert.equal(news.items.length, 0); assert.equal(news.errors.length, 3);
});
test('calendar parses timezone offset and never invents actual values', async () => {
  globalThis.fetch = async () => output([{ country: 'USD', impact: 'High', title: 'CPI', date: '2026-07-01T08:30:00-04:00', forecast: '3%', previous: '2.9%' }]);
  const calendar = await getCalendar(); assert.equal(calendar.events[0].date, '2026-07-01T12:30:00.000Z'); assert.equal(calendar.events[0].actual, null);
});
test('config never exposes credentials and API/legacy errors do not serve index.html', async () => {
  const env = { OPENAI_API_KEY: 'private-key', ASSETS: { fetch: () => new Response('static') } };
  const config = await (await worker.fetch(new Request('https://local/api/config'), env)).json();
  assert.ok(!JSON.stringify(config).includes('private-key')); assert.equal(config.openai, false);
  assert.equal((await worker.fetch(new Request('https://local/api/unknown'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://local/market-data'), env)).status, 410);
  assert.equal((await worker.fetch(new Request('https://local/api/history?asset=../../secrets'), env)).status, 400);
});
test('AI rejects missing authorization, cross-site requests and invalid JSON', async () => {
  const env = { ANALYSIS_TOKEN: 'local-access' };
  assert.equal((await worker.fetch(new Request('https://local/api/analyze', { method: 'POST' }), env)).status, 401);
  const options = { method: 'POST', headers: { Authorization: 'Bearer local-access', 'Content-Type': 'application/json' }, body: '{bad' };
  assert.equal((await worker.fetch(new Request('https://local/api/analyze', options), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://local/api/analyze', { ...options, headers: { ...options.headers, Origin: 'https://foreign' } }), env)).status, 403);
});
test('OpenAI analysis sends server quote with storage disabled and extracts output_text', async () => {
  globalThis.fetch = async (url, options) => {
    if (url.includes('gold-api')) return output({ price: 2000, updatedAt: new Date().toISOString() });
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.ok(body.input.includes('2000'));
    return output({ output: [{ content: [{ type: 'output_text', text: '假設情境分析' }] }] });
  };
  const env = { ANALYSIS_TOKEN: 'test-only', OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'configured-model' };
  const response = await worker.fetch(new Request('https://local/api/analyze', { method: 'POST', headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json', 'CF-Connecting-IP': 'test-openai' }, body: JSON.stringify({ provider: 'openai', directions: { DXY: 1 } }) }), env);
  assert.equal(response.status, 200); assert.equal((await response.json()).text, '假設情境分析');
});

test('Gemini uses a server header and extracts candidate parts, with per-client cooldown', async () => {
  globalThis.fetch = async (url, options) => {
    if (url.includes('gold-api')) return output({ price: 2000, updatedAt: new Date().toISOString() });
    assert.match(url, /:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], 'gemini-mock');
    return output({ candidates: [{ content: { parts: [{ text: 'Gemini 測試分析' }] } }] });
  };
  const env = { ANALYSIS_TOKEN: 'test-only', GEMINI_API_KEY: 'gemini-mock', GEMINI_MODEL: 'configured-gemini' };
  const request = () => new Request('https://local/api/analyze', { method: 'POST', headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json', 'CF-Connecting-IP': 'test-gemini' }, body: JSON.stringify({ provider: 'gemini' }) });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200); assert.equal((await response.json()).text, 'Gemini 測試分析');
  assert.equal((await worker.fetch(request(), env)).status, 429);
});
test('AI refuses oversized streaming input even without Content-Length', async () => {
  const response = await worker.fetch(new Request('https://local/api/analyze', { method: 'POST', headers: { Authorization: 'Bearer local-access', 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'a'.repeat(13000) }) }), { ANALYSIS_TOKEN: 'local-access' });
  assert.equal(response.status, 413);
});
