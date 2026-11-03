import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, withDeadline, analysisButtonState, createAnalysisTask } from '../lib/client-api.js';

test('analysis stays actionable without saved config and shows save-and-analyze for a draft Key', () => {
  assert.deepEqual(analysisButtonState(), { disabled: false, label: '分析' });
  assert.deepEqual(analysisButtonState({ draftKey: 'test-key' }), { disabled: false, label: '儲存並分析' });
  assert.deepEqual(analysisButtonState({ running: true, draftKey: 'test-key' }), { disabled: true, label: '分析中…' });
  assert.equal(analysisButtonState({ provider: 'openai', draftKey: 'test-key' }).label, '分析');
});
test('request timeout covers a transport that never responds or ignores abort', async () => {
  const api = createApiClient({ fetchImpl: () => new Promise(() => {}) });
  await assert.rejects(api('/api/config', { timeoutMs: 15 }), error => error.name === 'TimeoutError');
});
test('request timeout covers a response body that never completes', async () => {
  const api = createApiClient({ fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  await assert.rejects(api('/api/analyze', { timeoutMs: 15 }), /分析逾時/);
});
test('malformed JSON and failed network connections yield actionable errors', async () => {
  const malformed = createApiClient({ fetchImpl: async () => new Response('<html>error</html>') });
  await assert.rejects(malformed('/api/config'), /回應格式不正確/);
  const disconnected = createApiClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(disconnected('/api/config'), /無法連線後端/);
});
test('authorization failures are reported and do not leave a running analysis', async () => {
  const states = [];
  const task = createAnalysisTask(running => states.push(running));
  const api = createApiClient({ fetchImpl: async () => Response.json({ error: '需要管理存取碼' }, { status: 401 }) });
  await assert.rejects(task.run(() => api('/api/analyze')), error => error.status === 401);
  assert.deepEqual(states, [true, false]); assert.equal(task.running, false);
});
test('the entire workflow has a deadline and permits retry after timeout', async () => {
  const states = [];
  const task = createAnalysisTask(running => states.push(running), 15);
  await assert.rejects(task.run(() => new Promise(() => {})), /流程逾時/);
  assert.equal(task.running, false);
  assert.equal(await task.run(async () => 'retry worked'), 'retry worked');
  assert.deepEqual(states, [true, false, true, false]);
});
test('cancellation ends loading immediately even if the underlying transport ignores it', async () => {
  const task = createAnalysisTask(() => {});
  const running = task.run(() => new Promise(() => {}));
  task.cancel();
  await assert.rejects(running, error => error.name === 'AbortError');
  assert.equal(task.running, false);
});
test('double submissions are ignored without sending duplicate analysis requests', async () => {
  let release, calls = 0;
  const task = createAnalysisTask(() => {});
  const first = task.run(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  await task.run(async () => { calls++; });
  await Promise.resolve(); release('ok');
  assert.equal(await first, 'ok'); assert.equal(calls, 1);
});
test('token is read at request time (including autofill), not only from input events', async () => {
  let token = '';
  const api = createApiClient({ getToken: () => token, fetchImpl: async (url, options) => Response.json({ authorization: options.headers.get('Authorization') }) });
  token = 'autofilled-admin-token';
  assert.equal((await api('/api/analyze')).authorization, 'Bearer autofilled-admin-token');
  assert.equal((await api('/api/snapshot')).authorization, null);
});
test('an already-cancelled operation never starts a network request', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(withDeadline(async () => { calls++; }, { signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(calls, 0);
});
