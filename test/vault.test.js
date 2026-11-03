import test from 'node:test';
import assert from 'node:assert/strict';
import { CredentialVault, geminiCredentials } from '../lib/vault.js';
import worker from '../worker.js';

const KEY = 'AIza-fake-local-test-key-not-a-google-key';
function environment() {
  const values = new Map();
  const storage = { get: async key => values.get(key), put: async (key, value) => values.set(key, value), delete: async key => values.delete(key), transaction: async fn => fn(storage) };
  const env = { VAULT_ENCRYPTION_KEY: 'a1'.repeat(32), ANALYSIS_TOKEN: 'test-owner-token', ALLOWED_ORIGINS: 'https://brotherku1010.github.io' };
  const make = () => new CredentialVault({ storage }, env);
  let object = make();
  env.CREDENTIAL_VAULT = { idFromName: name => name, get: () => ({ fetch: request => object.fetch(request) }) };
  return { env, values, restart: () => { object = make(); } };
}
function request(method, path = '', body, token = 'test-owner-token', origin = 'https://brotherku1010.github.io') {
  return new Request(`https://api.example/api/settings/gemini${path}`, { method, headers: { Authorization: `Bearer ${token}`, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const save = env => worker.fetch(request('PUT', '', { apiKey: KEY, model: 'gemini-test-model' }), env);

test('Gemini Key is AES-GCM encrypted, persists after object restart, and is not returned by settings/config', async () => {
  const { env, values, restart } = environment();
  const response = await save(env);
  assert.equal(response.status, 200);
  assert.ok(!JSON.stringify(await response.json()).includes(KEY));
  assert.ok(!JSON.stringify([...values]).includes(KEY));
  assert.notEqual(values.get('gemini').ciphertext, KEY);
  restart();
  assert.equal((await geminiCredentials(env)).apiKey, KEY);
  for (const response of [await worker.fetch(request('GET'), env), await worker.fetch(new Request('https://api.example/api/config'), env)]) assert.ok(!JSON.stringify(await response.json()).includes(KEY));
});
test('DELETE removes active credentials, persists the deletion and disables legacy fallback', async () => {
  const { env, values, restart } = environment();
  env.GEMINI_API_KEY = 'legacy-must-not-reappear'; env.GEMINI_MODEL = 'gemini-old';
  await save(env);
  assert.equal((await worker.fetch(request('DELETE'), env)).status, 200);
  assert.equal(values.has('gemini'), false);
  restart();
  assert.equal(await geminiCredentials(env), null);
  assert.equal((await (await worker.fetch(new Request('https://api.example/api/config'), env)).json()).gemini, false);
});
test('unauthorized visitors cannot save, test, read models or delete credentials', async () => {
  const { env } = environment();
  await save(env);
  for (const [method, path] of [['DELETE', ''], ['GET', ''], ['PUT', ''], ['POST', '/test'], ['POST', '/models']]) assert.equal((await worker.fetch(request(method, path, undefined, 'wrong'), env)).status, 401);
  assert.equal((await geminiCredentials(env)).apiKey, KEY);
});
test('allowed GitHub Pages preflight works without allowing arbitrary origins', async () => {
  const { env } = environment();
  const approved = await worker.fetch(request('OPTIONS'), env);
  assert.equal(approved.status, 204);
  assert.equal(approved.headers.get('Access-Control-Allow-Origin'), 'https://brotherku1010.github.io');
  assert.match(approved.headers.get('Access-Control-Allow-Methods'), /DELETE/);
  const blocked = await worker.fetch(request('PUT', '', { apiKey: KEY, model: 'gemini-test-model' }, 'test-owner-token', 'https://attacker.invalid'), env);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(await geminiCredentials(env), null);
});
test('local admin bypass only works with explicit dev flag AND loopback host', async () => {
  const { env } = environment(); env.ALLOW_LOCAL_ADMIN = 'true';
  const body = JSON.stringify({ apiKey: KEY, model: 'gemini-test-model' });
  const options = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body };
  assert.equal((await worker.fetch(new Request('https://public.example/api/settings/gemini', options), env)).status, 401);
  assert.equal((await worker.fetch(new Request('http://127.0.0.1:8787/api/settings/gemini', options), env)).status, 200);
});
test('local admin token is never exposed by public backend or cross-origin local requests', async () => {
  const { env } = environment(); env.ALLOW_LOCAL_ADMIN = 'true';
  assert.equal((await worker.fetch(new Request('https://api.example/api/local-admin-token'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('http://127.0.0.1:8787/api/local-admin-token', { headers: { Origin: 'https://brotherku1010.github.io' } }), env)).status, 404);
  const local = await worker.fetch(new Request('http://127.0.0.1:8787/api/local-admin-token'), env);
  assert.equal(local.status, 200); assert.equal((await local.json()).token, 'test-owner-token');
});
test('invalid input, missing master key and decryption failure do not overwrite or delete a saved key', async () => {
  const { env, values } = environment();
  await save(env); const original = values.get('gemini');
  assert.equal((await worker.fetch(request('PUT', '', { apiKey: 'short', model: 'gemini-test-model' }), env)).status, 400);
  env.VAULT_ENCRYPTION_KEY = '';
  assert.equal((await save(env)).status, 503);
  assert.deepEqual(values.get('gemini'), original);
  env.VAULT_ENCRYPTION_KEY = 'b2'.repeat(32);
  await assert.rejects(geminiCredentials(env));
  assert.deepEqual(values.get('gemini'), original);
});
test('blank Key on model update retains the existing encrypted secret', async () => {
  const { env, values } = environment();
  await save(env); const iv = values.get('gemini').iv;
  const update = await worker.fetch(request('PUT', '', { apiKey: '', model: 'models/gemini-other-model' }), env);
  assert.equal(update.status, 200);
  assert.equal((await geminiCredentials(env)).apiKey, KEY);
  assert.equal((await geminiCredentials(env)).model, 'gemini-other-model');
  assert.notEqual(values.get('gemini').iv, iv);
});
test('models and connection tests only send stored Key to Google, never to the client', async () => {
  const native = globalThis.fetch;
  const { env } = environment(); await save(env);
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
    assert.equal(options.headers['x-goog-api-key'], KEY);
    return Response.json(url.includes(':generateContent') ? { candidates: [{ content: { parts: [{ text: 'OK' }] } }] } : { models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-image-model', supportedGenerationMethods: ['generateContent'] }] });
  };
  try {
    const models = await (await worker.fetch(request('POST', '/models', {}), env)).json();
    assert.deepEqual(models.models.map(model => model.id), ['gemini-flash-latest']);
    const result = await (await worker.fetch(request('POST', '/test'), env)).json();
    assert.equal(result.ok, true); assert.ok(!JSON.stringify(result).includes(KEY));
  } finally { globalThis.fetch = native; }
});
