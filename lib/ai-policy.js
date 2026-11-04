import { failure } from './http.js';

// Explicit IDs only: latest aliases can change pricing without a code change.
export const FREE_MODELS = Object.freeze(['gemini-3.1-flash-lite']);
export const BILLING_CONFIRMATION_MS = 24 * 60 * 60 * 1000;
export const aiPolicy = {
  mode: 'free-tier-only',
  models: FREE_MODELS,
  pricingCheckedOn: '2026-11-04',
  billingVerification: 'owner-confirmation',
  confirmationHours: 24
};

export function freeProjectConfirmed(credentials, now = Date.now()) {
  const time = Date.parse(credentials?.freeTierConfirmedAt);
  return Number.isFinite(time) && time <= now && now - time < BILLING_CONFIRMATION_MS;
}

export function assertFreeModel(model) {
  if (!FREE_MODELS.includes(model)) throw failure('免費方案限制：此模型未開放。Gemini 3.1 Pro API 沒有免費層；目前僅允許 gemini-3.1-flash-lite。', 403);
}

export function assertFreeGeneration(credentials) {
  assertFreeModel(credentials.model);
  if (!freeProjectConfirmed(credentials)) throw failure('生成已暫停：請先在 Google AI Studio 確認此 Key 的專案為 Free 且未啟用計費，再於設定頁確認並儲存。系統無法透過 API Key 驗證帳務；確認有效期為 24 小時。', 403);
}
