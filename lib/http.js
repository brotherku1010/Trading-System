export const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export const failure = (message, status = 400) => Object.assign(new Error(message), { safeMessage: message, status });

export function isLocalAdmin(request, env) {
  return env.ALLOW_LOCAL_ADMIN === 'true' && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname);
}

export function authorized(request, env) {
  return isLocalAdmin(request, env) || Boolean(env.ANALYSIS_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ANALYSIS_TOKEN}`);
}

export function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin || (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean).includes(origin);
}

export function withCors(response, request) {
  const origin = request.headers.get('Origin');
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '600');
  return new Response(response.body, { status: response.status, headers });
}

export async function readJson(request, maxBytes = 12000) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw failure('需要 JSON', 415);
  const reader = request.body?.getReader();
  if (!reader) throw failure('缺少內容');
  let text = '', bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) { await reader.cancel(); throw failure('內容過長', 413); }
    text += decoder.decode(value, { stream: true });
  }
  let body;
  try { body = JSON.parse(text + decoder.decode()); } catch { throw failure('JSON 格式錯誤'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure('內容無效');
  return body;
}
