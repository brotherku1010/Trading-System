import { failure } from './http.js';
import { assertFreeGeneration } from './ai-policy.js';

const messages = {
  400: '請檢查 API Key、模型參數及 Google 專案設定',
  401: '請檢查 Gemini API Key 是否有效',
  403: '請檢查 Key 限制及 Google 專案權限',
  404: '模型不可用，請在設定頁重新取得可用模型並儲存',
  429: '已達速率或用量限制，請查看 Google AI Studio 的額度與帳務',
  503: '服務暫時不可用，請稍後重試或選擇其他可用模型'
};

export async function geminiRequest(path, apiKey, payload) {
  const operation = payload ? '文字生成' : '模型清單';
  const signal = AbortSignal.timeout(payload ? 45000 : 9000);
  for (let attempt = 0; ; attempt++) {
    let status;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
        method: payload ? 'POST' : 'GET',
        headers: { 'x-goog-api-key': apiKey, ...(payload && { 'Content-Type': 'application/json' }) },
        body: payload ? JSON.stringify(payload) : undefined,
        signal
      });
      if (response.ok) return await response.json();
      status = response.status;
      await response.body?.cancel();
    } catch {
      throw failure(`Gemini ${operation}${signal.aborted ? '逾時' : '連線或回應格式異常'}，請稍後重試。`, signal.aborted ? 504 : 502);
    }
    if (status === 503 && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 350 * 2 ** attempt));
      continue;
    }
    throw failure(`Gemini ${operation}失敗（HTTP ${status}）${status === 503 ? '，已重試兩次' : ''}：${messages[status] || '請稍後重試'}。`, messages[status] ? status : 502);
  }
}

export async function generateGemini(credentials, payload) {
  assertFreeGeneration(credentials);
  const { apiKey, model } = credentials;
  const data = await geminiRequest(`models/${encodeURIComponent(model)}:generateContent`, apiKey, payload);
  const text = data?.candidates?.[0]?.content?.parts?.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('\n').trim();
  if (!text) throw failure(`Gemini 模型 ${model} 未回傳可顯示的文字，請確認模型支援文字生成或改用其他模型。`, 502);
  return text;
}
