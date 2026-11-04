export async function withDeadline(operation, { timeoutMs = 15000, signal, timeoutMessage = '連線逾時，請重試。' } = {}) {
  const controller = new AbortController();
  let timer, abort;
  const stopped = new Promise((_, reject) => {
    abort = () => { controller.abort(); reject(Object.assign(new Error('已取消，遠端已送出的請求仍可能計入額度。'), { name: 'AbortError' })); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error(timeoutMessage), { name: 'TimeoutError' })); }, timeoutMs);
  });
  try {
    if (signal?.aborted) return await stopped;
    // Race the whole operation, including body parsing, even if a transport ignores abort.
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), stopped]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function createApiClient({ getBase = () => '', getToken = () => '', fetchImpl = (...args) => fetch(...args) } = {}) {
  return (path, options = {}) => {
    const pathname = path.split('?', 1)[0];
    const timeoutMs = options.timeoutMs ?? (pathname === '/api/config' ? 8000 : pathname === '/api/analyze' || pathname.endsWith('/test') ? 60000 : pathname.startsWith('/api/settings/') ? 15000 : 30000);
    return withDeadline(async signal => {
      const { timeoutMs: _, ...fetchOptions } = options;
      const headers = new Headers(fetchOptions.headers);
      const token = getToken();
      if ((path.startsWith('/api/settings/') || path === '/api/analyze') && token) headers.set('Authorization', `Bearer ${token}`);
      let response;
      try { response = await fetchImpl(`${getBase()}${path}`, { ...fetchOptions, headers, signal, cache: 'no-store', credentials: 'omit' }); }
      catch (error) { if (signal.aborted) throw error; throw new Error('無法連線後端，請確認網路後重試。'); }
      let data;
      try { data = await response.json(); }
      catch { throw new Error('後端回應格式不正確，請重新整理新版頁面後重試。'); }
      if (!response.ok) throw Object.assign(new Error(data.error || `服務回應 ${response.status}`), { status: response.status });
      return data;
    }, { timeoutMs, signal: options.signal, timeoutMessage: path === '/api/analyze' ? 'AI 分析逾時，已停止等待；可稍後重試。' : '取得設定或資料逾時，請重試。' });
  };
}

export function analysisButtonState({ running = false, provider = 'gemini', draftKey = '' } = {}) {
  return { disabled: running, label: running ? '分析中…' : provider === 'gemini' && draftKey.trim() ? '儲存並分析' : '分析' };
}

export function createAnalysisTask(onChange, timeoutMs = 75000) {
  let active = null;
  return {
    get running() { return Boolean(active); },
    cancel() { active?.abort(); },
    async run(operation) {
      if (active) return;
      const controller = new AbortController(); active = controller;
      try {
        onChange(true);
        return await withDeadline(operation, { signal: controller.signal, timeoutMs, timeoutMessage: '分析流程逾時，已停止等待；設定與研究問題仍保留，可再試一次。' });
      } finally { active = null; onChange(false); }
    }
  };
}
