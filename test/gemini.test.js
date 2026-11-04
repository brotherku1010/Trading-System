import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geminiRequest, generateGemini } from '../lib/gemini.js';

const credentials = { apiKey: 'mock-key', model: 'gemini-3.1-flash-lite', freeTierConfirmedAt: new Date().toISOString() };

test('Gemini retries 503 and returns only visible text from the configured model', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /gemini-3.1-flash-lite:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], credentials.apiKey);
    if (++calls === 1) return new Response(null, { status: 503 });
    return Response.json({ candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }, { text: ' OK ' }] } }] });
  });
  assert.equal(await generateGemini(credentials, {}), 'OK');
  assert.equal(calls, 2);
});

test('persistent Gemini 503 stops after two retries without exposing upstream content', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(credentials.apiKey, { status: 503 }));
  await assert.rejects(generateGemini(credentials, {}), error => error.status === 503 && /Gemini.*已重試兩次/.test(error.safeMessage) && !error.safeMessage.includes(credentials.apiKey));
  assert.equal(fetch.mock.callCount(), 3);
});

test('Gemini model discovery surfaces quota without retrying', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));
  await assert.rejects(geminiRequest('models', credentials.apiKey), error => error.status === 429 && /額度/.test(error.safeMessage));
  assert.equal(fetch.mock.callCount(), 1);
});

test('a thought-only Gemini candidate cannot pass the connection test', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }] } }] }));
  await assert.rejects(generateGemini(credentials, {}), /未回傳可顯示的文字/);
});

test('paid or unconfirmed Gemini calls stop before fetch', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Blocked before fetch'));
  await assert.rejects(generateGemini({ ...credentials, model: 'gemini-3.1-pro-preview' }, {}), /免費方案限制/);
  await assert.rejects(generateGemini({ ...credentials, freeTierConfirmedAt: null }, {}), /生成已暫停/);
  await assert.rejects(generateGemini({ ...credentials, freeTierConfirmedAt: new Date(Date.now() + 86400000).toISOString() }, {}), /生成已暫停/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('generation quota exhaustion never retries or changes model', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));
  await assert.rejects(generateGemini(credentials, {}), error => error.status === 429);
  assert.equal(fetch.mock.callCount(), 1);
});
