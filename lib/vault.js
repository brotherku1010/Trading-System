import { json, failure, authorized, readJson } from './http.js';
import { requestJson } from './providers.js';

const encoder = new TextEncoder();
const context = encoder.encode('paw-gemini-credentials-v1');
export const encryptionReady = env => /^[a-f0-9]{64}$/i.test(env.VAULT_ENCRYPTION_KEY || '');
const encode = data => btoa(String.fromCharCode(...new Uint8Array(data)));
const decode = data => Uint8Array.from(atob(data), char => char.charCodeAt(0));

export function validateGeminiInput(body, requireKey = true) {
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const model = typeof body.model === 'string' ? body.model.trim().replace(/^models\//, '') : '';
  if ((requireKey || apiKey) && !/^[A-Za-z0-9_-]{16,256}$/.test(apiKey)) throw failure('Gemini Key 格式不正確');
  if (!/^gemini-[A-Za-z0-9._-]{1,120}$/.test(model)) throw failure('請選擇或輸入有效的 Gemini 模型代號');
  return { apiKey, model };
}

// Only the Worker binding can reach this object. No public endpoint returns decrypted credentials.
export class CredentialVault {
  constructor(ctx, env) { this.storage = ctx.storage; this.env = env; }
  async encryptionKey() {
    if (!encryptionReady(this.env)) throw failure('伺服器尚未設定 Key 加密金鑰', 503);
    const bytes = Uint8Array.from(this.env.VAULT_ENCRYPTION_KEY.match(/../g), pair => parseInt(pair, 16));
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/status') {
        const record = await this.storage.get('gemini');
        return json({ saved: Boolean(record), model: record?.model || null, updatedAt: record?.updatedAt || null, disabled: Boolean(await this.storage.get('gemini-disabled')) });
      }
      if (path === '/credentials') {
        const record = await this.storage.get('gemini');
        if (!record) return json({ saved: false, disabled: Boolean(await this.storage.get('gemini-disabled')) });
        const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv), additionalData: context }, await this.encryptionKey(), decode(record.ciphertext));
        return json({ saved: true, apiKey: new TextDecoder().decode(raw), model: record.model });
      }
      if (path === '/gemini' && request.method === 'PUT') {
        const body = await request.json();
        const input = validateGeminiInput(body, false);
        if (!input.apiKey) {
          const previous = await this.storage.get('gemini');
          if (!previous) throw failure('首次儲存需要 Gemini Key');
          const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(previous.iv), additionalData: context }, await this.encryptionKey(), decode(previous.ciphertext));
          input.apiKey = new TextDecoder().decode(raw);
        }
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context }, await this.encryptionKey(), encoder.encode(input.apiKey));
        const record = { iv: encode(iv), ciphertext: encode(ciphertext), model: input.model, updatedAt: new Date().toISOString(), version: 1 };
        await this.storage.transaction(async tx => { await tx.put('gemini', record); await tx.delete('gemini-disabled'); });
        return json({ saved: true, model: record.model, updatedAt: record.updatedAt });
      }
      if (path === '/gemini' && request.method === 'DELETE') {
        await this.storage.transaction(async tx => { await tx.delete('gemini'); await tx.put('gemini-disabled', true); });
        return json({ saved: false, disabled: true });
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) { return json({ error: error.safeMessage || 'Key 儲存服務暫時無法使用，原設定未被清除。' }, error.status || 503); }
  }
}

async function vaultCall(env, path, options) {
  if (!env.CREDENTIAL_VAULT) throw failure('尚未部署 Key 儲存服務', 503);
  const stub = env.CREDENTIAL_VAULT.get(env.CREDENTIAL_VAULT.idFromName('owner'));
  const response = await stub.fetch(new Request(`https://vault.internal${path}`, options));
  const result = await response.json();
  if (!response.ok) throw failure(result.error || 'Key 儲存服務暫時無法使用', response.status);
  return result;
}

export async function geminiStatus(env) {
  const record = env.CREDENTIAL_VAULT ? await vaultCall(env, '/status') : { saved: false, disabled: false };
  const legacy = !record.saved && !record.disabled && Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL);
  return { ...record, legacy, available: record.saved ? encryptionReady(env) : legacy, persistent: Boolean(env.CREDENTIAL_VAULT && encryptionReady(env)), model: record.model || (legacy ? env.GEMINI_MODEL : null) };
}

export async function geminiCredentials(env) {
  if (env.CREDENTIAL_VAULT) {
    const record = await vaultCall(env, '/credentials');
    if (record.saved) return record;
    if (record.disabled) return null;
  }
  return env.GEMINI_API_KEY && env.GEMINI_MODEL ? { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL } : null;
}

export async function handleGeminiSettings(request, env) {
  if (!authorized(request, env)) return json({ error: '請輸入管理存取碼' }, 401);
  const path = new URL(request.url).pathname;
  if (path === '/api/settings/gemini' && request.method === 'GET') return json(await geminiStatus(env));
  if (path === '/api/settings/gemini' && request.method === 'PUT') {
    if (!encryptionReady(env)) throw failure('伺服器尚未啟用加密保存', 503);
    const body = await readJson(request, 2048);
    const input = validateGeminiInput(body, false);
    return json(await vaultCall(env, '/gemini', { method: 'PUT', body: JSON.stringify(input) }));
  }
  if (path === '/api/settings/gemini' && request.method === 'DELETE') return json(await vaultCall(env, '/gemini', { method: 'DELETE' }));
  if (path === '/api/settings/gemini/models' && request.method === 'POST') {
    const body = await readJson(request, 2048);
    const saved = body.apiKey ? null : await geminiCredentials(env);
    const apiKey = body.apiKey ? validateGeminiInput({ ...body, model: 'gemini-placeholder' }).apiKey : saved?.apiKey;
    if (!apiKey) throw failure('請先輸入或儲存 Gemini Key');
    const models = [];
    let pageToken = '';
    for (let page = 0; page < 5; page++) {
      const query = new URLSearchParams({ pageSize: '100', ...(pageToken ? { pageToken } : {}) });
      const data = await requestJson(`https://generativelanguage.googleapis.com/v1beta/models?${query}`, { headers: { 'x-goog-api-key': apiKey } });
      models.push(...(data.models || []).filter(model => model.supportedGenerationMethods?.includes('generateContent') && /^models\/gemini-/.test(model.name) && !/image|tts|robotics|embedding/i.test(model.name)).map(model => ({ id: model.name.replace('models/', ''), name: model.displayName || model.name })));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return json({ models });
  }
  if (path === '/api/settings/gemini/test' && request.method === 'POST') {
    const credentials = await geminiCredentials(env);
    if (!credentials) throw failure('請先儲存 Gemini Key');
    const data = await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(credentials.model)}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': credentials.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK only.' }] }], generationConfig: { maxOutputTokens: 128 } })
    }, 45000);
    if (!data.candidates?.length) throw failure('模型未回傳有效內容，請檢查額度與模型支援', 502);
    return json({ ok: true, model: credentials.model, testedAt: new Date().toISOString() });
  }
  return json({ error: 'Method not allowed' }, 405);
}
