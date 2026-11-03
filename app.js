import { createIcons, RefreshCw, GitCompareArrows, ChartNoAxesCombined, CalendarDays, Database, RotateCcw, BookmarkPlus, Download, Info, ArrowUpRight, Sparkles, ExternalLink, CircleAlert, Clock3, Trash2, Upload, FileDown, DatabaseBackup, ShieldCheck, TrendingDown, TrendingUp, Minus, CircleHelp, X, List, Save, PlugZap, LockKeyhole, Copy, KeyRound, Square } from 'lucide';
import { FACTORS, ASSETS, REGIMES, MACRO } from './lib/catalog.js';
import { scenarioScore, correlation, conditionalStudy, technicalSummary, projectionRange, parseHistoryCsv, macroSurprise, marketSessions } from './lib/analysis.js';
import { createApiClient, withDeadline, analysisButtonState, createAnalysisTask } from './lib/client-api.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icons = () => createIcons({ icons: { RefreshCw, GitCompareArrows, ChartNoAxesCombined, CalendarDays, Database, RotateCcw, BookmarkPlus, Download, Info, ArrowUpRight, Sparkles, ExternalLink, CircleAlert, Clock3, Trash2, Upload, FileDown, DatabaseBackup, ShieldCheck, TrendingDown, TrendingUp, Minus, CircleHelp, X, List, Save, PlugZap, LockKeyhole, Copy, KeyRound, Square } });
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const signed = (value, digits = 2) => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${fmt(value, digits)}` : '—';
const tone = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
const statusNames = { recent: '近期更新', daily: '日資料', stale: '過期／休市待確認', 'unknown-time': '時間未知', unavailable: '無資料', 'update-failed': '更新失敗／舊值' };
const state = { directions: {}, regime: 'normal', strength: 1, window: 252, horizon: 1, history: {}, quotes: {}, config: {}, calendar: [], tab: '', busy: new Set(), snapshotRunning: false, newsLoaded: false, calendarLoaded: false, study: null };
let apiBase = '';
let adminToken = '';
let analysisTask;
let providerTouched = false;
const api = createApiClient({ getBase: () => apiBase, getToken: () => $('settings-token')?.value || $('analysis-token')?.value || adminToken });

function localRead(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function localWrite(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { notice('瀏覽器儲存空間不可用，情境僅保留於本分頁。'); } }
let saved = localRead('paw-gold-scenarios-v2', []);
if (!Array.isArray(saved)) saved = [];

function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function draftKey() { return $('analysis-api-key').value.trim() || $('gemini-api-key').value.trim(); }
function updateAnalysisButton() {
  const provider = $('ai-provider').value;
  const button = analysisButtonState({ running: analysisTask?.running, provider, draftKey: draftKey() });
  $('ai-submit').disabled = button.disabled;
  $('ai-submit-label').textContent = button.label;
  $('ai-submit').classList.toggle('busy', button.disabled);
  $('ai-submit').setAttribute('aria-busy', String(button.disabled));
  $('ai-cancel').hidden = !button.disabled;
  $('analysis-key-label').hidden = provider !== 'gemini';
  $('analysis-model-label').hidden = provider !== 'gemini';
}

function applyConfig(config) {
  state.config = config;
  const gemini = config.geminiSettings || {};
  $('ai-status').textContent = [config.openai ? 'OpenAI 已設定' : '', config.gemini ? 'Gemini 已設定' : ''].filter(Boolean).join(' · ') || '未設定 AI，不影響情境研究';
  if (!providerTouched && !draftKey() && config.openai && !config.gemini) $('ai-provider').value = 'openai';
  $('admin-token-label').hidden = Boolean(config.localAdmin);
  $('copy-admin-token').hidden = !config.localAdmin;
  $('analysis-token').closest('label').hidden = Boolean(config.localAdmin);
  if (gemini.model) { $('gemini-model').value ||= gemini.model; $('analysis-model').value ||= gemini.model; }
  $('gemini-key-status').textContent = gemini.saved ? `已加密儲存 · ${gemini.model} · ${timestamp(gemini.updatedAt)}` : gemini.legacy ? '使用伺服器環境變數' : gemini.disabled ? 'Key 已刪除' : gemini.persistent ? '尚未儲存 Key' : '後端尚未啟用加密保存';
  $('gemini-save').disabled = !gemini.persistent;
  $('gemini-delete').disabled = !gemini.persistent || (!gemini.saved && !gemini.legacy);
  $('gemini-test').disabled = !config.gemini;
  $('provider-status').innerHTML = `<div>API 後端<span>${esc(apiBase || location.origin)}</span></div><div>公開參考行情<span>Gold API / Binance / FRED；依來源可用性</span></div><div>Twelve Data<span>${config.twelveData ? 'Key 已設定，商品權限需逐項查詢' : '尚未設定 Key'}</span></div><div>Gemini<span>${gemini.saved ? 'Key 已加密保存在伺服器' : config.gemini ? '環境變數已設定' : '尚未設定 Key'}</span></div><div>cTrader XAUUSD 合約<span>未連線券商；公開現貨不是可成交 bid／ask</span></div>`;
  updateAnalysisButton();
}
async function refreshConfig(options) { applyConfig(await api('/api/config', options)); }

function applySavedGemini(result, savedKey = '') {
  applyConfig({ ...state.config, gemini: true, geminiSettings: { ...state.config.geminiSettings, ...result, saved: true, disabled: false, legacy: false, available: true, persistent: true } });
  $('gemini-model').value = result.model; $('analysis-model').value = result.model;
  for (const id of ['gemini-api-key', 'analysis-api-key']) if ($(id).value.trim() === savedKey) $(id).value = '';
  updateAnalysisButton();
}

async function prepareGemini(signal) {
  const key = draftKey();
  if ($('analysis-api-key').value.trim() && $('gemini-api-key').value.trim() && $('analysis-api-key').value.trim() !== $('gemini-api-key').value.trim()) throw new Error('分析區與設定頁輸入了不同的 Key，請先確認要使用哪一個。');
  const stored = state.config.geminiSettings;
  let model = $('analysis-model').value.trim() || $('gemini-model').value.trim() || stored?.model;
  if (!key && !state.config.gemini) throw new Error('尚未儲存 Gemini Key。請填寫「Gemini API Key」，再按「儲存並分析」。');
  if (key && !/^[A-Za-z0-9_-]{16,256}$/.test(key)) throw new Error('Gemini API Key 格式不正確；管理存取碼與 Gemini Key 是不同欄位。');
  if (key || (model && model !== stored?.model)) {
    if (!model) {
      $('ai-output').textContent = '正在確認此 Key 可用的文字模型…';
      const data = await api('/api/settings/gemini/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key }), signal });
      model = (data.models.find(item => item.id === 'gemini-flash-latest') || data.models.find(item => /flash/.test(item.id)) || data.models[0])?.id;
      if (!model) throw new Error('此 Key 未取得可用文字模型，請檢查 Google 權限。');
    }
    $('ai-output').textContent = '正在加密儲存 Gemini 設定…';
    const saved = await api('/api/settings/gemini', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key, model }), signal });
    applySavedGemini(saved, key);
    $('gemini-settings-result').textContent = 'Key 已加密保存在後端。';
  }
}

async function keyAction(button, task) {
  await busy(button, async () => {
    $('gemini-settings-result').textContent = '處理中…';
    try { await task(); }
    catch (error) { $('gemini-settings-result').textContent = error.message; }
  });
  const config = state.config.geminiSettings;
  if (config) {
    $('gemini-delete').disabled = !config.persistent || (!config.saved && !config.legacy);
    $('gemini-save').disabled = !config.persistent;
    $('gemini-test').disabled = !state.config.gemini;
  }
}
async function busy(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  try { await task(); } catch (error) { notice(error.message || '連線失敗，請重試。'); }
  finally { button.disabled = false; }
}

function quoteState(quote) {
  if (!Number.isFinite(quote?.price)) return 'unavailable';
  if (quote.refreshFailed) return 'update-failed';
  const date = Date.parse(quote.asOf);
  if (!Number.isFinite(date) || date > Date.now() + 60000) return 'unknown-time';
  if (quote.quoteType === 'daily-yield') return Date.now() - date > 7 * 86400000 ? 'stale' : 'daily';
  return Date.now() - date > 120000 ? 'stale' : 'recent';
}
function timestamp(value, zone = 'Asia/Taipei', dateOnly = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return '時間未知';
  if (dateOnly) return value.slice(0, 10);
  return new Intl.DateTimeFormat('zh-TW', { timeZone: zone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
function quoteChange(q) {
  if (Number.isFinite(q?.changeBps)) return `${signed(q.changeBps, 1)} bp`;
  return Number.isFinite(q?.changePercent) ? `${signed(q.changePercent)}%` : '漲跌幅未提供';
}

function renderQuotes() {
  $('quote-strip').innerHTML = ['GOLD', 'SILVER', 'BTC', 'ETH', 'US10Y', 'REAL10Y'].map(id => {
    const asset = ASSETS.find(item => item.id === id), quote = state.quotes[id], status = quoteState(quote);
    return `<div class="strip-quote"><div class="quote-name"><span>${esc(asset.name)}</span><span class="dot ${status}" title="${statusNames[status]}"></span></div><div class="strip-price">${fmt(quote?.price)}${asset.kind === 'yield' && Number.isFinite(quote?.price) ? '<small>%</small>' : ''}</div><div class="strip-source">${status === 'unavailable' ? '無可用資料' : `${esc(statusNames[status])} · ${timestamp(quote.asOf, 'Asia/Taipei', quote.precision === 'date')}`}</div></div>`;
  }).join('');
  if (state.tab === 'markets') renderMarkets();
  if (state.tab === 'settings') renderAudit();
}

function renderFactors() {
  $('factor-rows').innerHTML = FACTORS.map(factor => `<tr data-factor="${factor.id}"><td><div class="factor-name">${factor.name}<span class="factor-hint" tabindex="0" title="${esc(factor.note)}"><i data-lucide="circle-help"></i></span></div><div class="factor-symbol">${factor.symbol}${factor.proxy ? ' / ETF 代理' : ''}</div></td><td><div class="direction-control" role="radiogroup" aria-label="${factor.name}假設方向">${[[-1, 'trending-down', '下跌'], [0, 'minus', '不設定'], [1, 'trending-up', '上漲']].map(([value, icon, name]) => `<label title="${name}"><input type="radio" name="dir-${factor.id}" value="${value}" aria-label="${factor.name}${name}" ${(state.directions[factor.id] || 0) === value ? 'checked' : ''}><span><i data-lucide="${icon}"></i></span></label>`).join('')}</div></td><td class="correlation-cell">—</td><td class="influence-cell neutral">—</td></tr>`).join('');
  icons();
}

function renderAnalysis() {
  const result = scenarioScore(state.directions, state.regime, state.strength);
  const study = conditionalStudy(state.history, state.directions, { window: state.window, horizon: state.horizon });
  state.study = study;
  $('scenario-label').textContent = result.label;
  $('scenario-label').className = tone(result.total);
  $('mobile-direction').textContent = result.label;
  $('mobile-direction').className = tone(result.total);
  $('regime-note').textContent = result.regime.note;
  $('score-marker').style.left = `${Math.max(3, Math.min(97, 50 + result.total * 4))}%`;
  $('selected-count').textContent = `${result.contributions.length} 項已設定`;
  $('sample-count').textContent = `${study.n} 筆相符`;
  const missingNames = study.missing.map(id => FACTORS.find(f => f.id === id)?.name).join('、');
  $('study-result').innerHTML = study.probability === null
    ? `<p class="muted">${esc(study.reason)}${missingNames ? `：${esc(missingNames)}` : ''}。</p>`
    : `<div class="study-number">${fmt(study.probability * 100, 1)}<small>% 後續上漲頻率</small></div><div class="metric-row"><span>Wilson 95% 區間</span><strong>${fmt(study.interval[0] * 100, 1)}–${fmt(study.interval[1] * 100, 1)}%</strong></div><div class="metric-row"><span>後 ${state.horizon} 日報酬中位數</span><strong class="${tone(study.median)}">${signed(study.median)}%</strong></div><div class="metric-row"><span>歷史 10–90 百分位</span><strong>${signed(study.range[0])}% 至 ${signed(study.range[1])}%</strong></div><p class="muted">${study.start} 至 ${study.end}。排除重疊後續期間；僅依方向篩選，不含環境與強度。門檻：價格 0.1%、殖利率 1 bp。未做樣本外驗證；區間未校正序列相依。</p>`;
  const technical = technicalSummary(state.history.GOLD?.bars);
  const gold = state.quotes.GOLD;
  let technicalHtml = technical ? `<div class="metric-row"><span>近 20 日收盤最低／最高</span></div><div class="metric-row"><strong>${fmt(technical.low)}–${fmt(technical.high)}</strong><span>USD / oz</span></div><div class="metric-row"><span>20 日均值</span><strong>${fmt(technical.average)}</strong></div><div class="metric-row"><span>日 RSI (14)</span><strong>${fmt(technical.rsi, 1)}</strong></div><div class="metric-row"><span>日 MACD 柱狀值</span><strong>${signed(technical.macd)}</strong></div><p class="muted">資料截至 ${technical.end}；觀察區間不是支撐／壓力保證。${esc(state.history.GOLD.source)}</p>` : '<p class="muted">缺少黃金歷史日資料，不產生價位或技術指標。</p>';
  const historyRecent = technical && Date.now() - Date.parse(technical.end) <= 7 * 86400000;
  const projection = projectionRange(study, gold, technical?.end);
  if (projection) technicalHtml += `<div class="metric-row"><span>歷史情境報酬套用參考現貨</span></div><div class="metric-row"><strong>${fmt(projection[0])}–${fmt(projection[1])}</strong></div><p class="muted">僅為歷史分位數的機械投射，非未來信賴區間，也不是 cTrader 可成交價。</p>`;
  else if (technical && !historyRecent) technicalHtml += '<p class="muted">歷史資料超過 7 日未更新，不套用目前現貨推算價位。</p>';
  $('technical-result').innerHTML = technicalHtml;
  const risks = ['相同經濟衝擊會同時影響多個品項；同組因子以平均降低重複計權，但未建模共線性。'];
  if (state.directions.DXY === 1) risks.push('美元與黃金同漲可能出現在避險、央行買盤或通膨失控；不能只靠美指判斷。');
  if (state.directions.WTI === -1) risks.push('原油跌若源於需求衰退或流動性緊縮，黃金未必上漲。');
  if (state.regime === 'normal') risks.push('實質利率、通膨預期與資金需求改變時，傳統關係可能失效。');
  if (state.regime === 'liquidity') risks.push('去槓桿初期黃金可能一起被賣出；政策救市後關係也可能反轉。');
  if (Object.keys(state.history).length) risks.push('日資料按日期比對，不代表同一秒收盤；跨市場結果僅供探索。');
  $('scenario-risks').innerHTML = risks.map(risk => `<li>${esc(risk)}</li>`).join('');
  for (const factor of FACTORS) {
    const row = document.querySelector(`[data-factor="${factor.id}"]`);
    const corr = correlation(state.history, factor.id, state.window);
    row.querySelector('.correlation-cell').innerHTML = `<span class="correlation-value ${tone(corr.value)}">${corr.value === null ? '—' : signed(corr.value)}</span><div class="sample">n = ${corr.n}</div>`;
    const contribution = result.contributions.find(item => item.id === factor.id)?.contribution || 0;
    const cell = row.querySelector('.influence-cell');
    cell.textContent = contribution > 0 ? '支持黃金' : contribution < 0 ? '壓抑黃金' : '未設定';
    cell.className = `influence-cell ${tone(contribution)}`;
  }
  drawContributions(result);
  compareBroker();
}

function drawContributions(result) {
  const canvas = $('contribution-chart');
  if (state.tab !== 'simulation') return;
  const width = canvas.clientWidth, height = canvas.clientHeight, ratio = Math.min(devicePixelRatio || 1, 2);
  if (!width) return;
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
  const ranked = [...result.contributions].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const values = ranked.slice(0, 6).map(item => ({ name: item.name, value: item.contribution }));
  if (ranked.length > 6) values.push({ name: `其餘 ${ranked.length - 6} 項合計`, value: ranked.slice(6).reduce((sum, item) => sum + item.contribution, 0) });
  if (result.regime.bias) values.push({ name: result.regime.name, value: result.regime.bias });
  ctx.font = '11px system-ui'; ctx.fillStyle = '#68746e';
  if (!values.length) { ctx.fillText('未設定方向', 14, 35); return; }
  const labelWidth = Math.min(140, width * 0.35), middle = labelWidth + (width - labelWidth) / 2;
  const max = Math.max(3, ...values.map(item => Math.abs(item.value)));
  const scale = (width - labelWidth - 40) / (max * 2);
  ctx.strokeStyle = '#cdd7cf'; ctx.beginPath(); ctx.moveTo(middle, 12); ctx.lineTo(middle, height - 25); ctx.stroke();
  const rowHeight = Math.min(28, (height - 35) / values.length);
  values.forEach((item, index) => {
    const y = 15 + index * rowHeight;
    ctx.fillStyle = '#68746e'; ctx.fillText(item.name, 0, y + 12, labelWidth - 5);
    ctx.fillStyle = item.value > 0 ? '#438d77' : '#c8747d';
    ctx.fillRect(item.value > 0 ? middle : middle + item.value * scale, y + 2, Math.max(1, Math.abs(item.value * scale)), 13);
  });
  ctx.fillStyle = '#68746e'; ctx.fillText('壓抑', labelWidth + 4, height - 3); ctx.fillText('支持', width - 32, height - 3);
}

function setScenario(scenario) {
  state.directions = Object.fromEntries(FACTORS.map(f => [f.id, [-1, 1].includes(scenario.directions?.[f.id]) ? scenario.directions[f.id] : 0]));
  state.regime = REGIMES[scenario.regime] ? scenario.regime : 'normal';
  state.strength = Math.min(2, Math.max(0.5, Number(scenario.strength) || 1));
  $('regime').value = state.regime; $('strength').value = state.strength; $('strength-value').value = `${state.strength.toFixed(1)}×`;
  $('ai-output').hidden = true;
  renderFactors(); renderAnalysis();
}

function renderSaved() {
  $('saved-scenarios').innerHTML = saved.slice(0, 10).map((item, index) => `<div class="saved-item"><button data-load="${index}" class="secondary">${esc(item.name)}</button><button data-delete="${index}" class="icon-button" title="刪除情境" aria-label="刪除${esc(item.name)}"><i data-lucide="x"></i></button></div>`).join('');
  icons();
}

async function refreshSnapshot() {
  if (state.snapshotRunning || document.hidden) return;
  state.snapshotRunning = true; $('refresh').disabled = true; $('refresh').classList.add('busy');
  try {
    const data = await api('/api/snapshot');
    for (const quote of data.quotes) {
      if (Number.isFinite(quote.price) || !state.quotes[quote.asset]) state.quotes[quote.asset] = quote;
      else if (['GOLD', 'SILVER', 'BTC', 'ETH', 'US10Y', 'REAL10Y'].includes(quote.asset)) state.quotes[quote.asset] = { ...state.quotes[quote.asset], refreshFailed: true, reason: quote.reason };
    }
    const available = Object.values(state.quotes).filter(q => Number.isFinite(q.price)).length;
    $('connection-status').textContent = `${available} 項有資料 · ${timestamp(data.fetchedAt)}`;
  } catch (error) {
    for (const quote of Object.values(state.quotes)) if (Number.isFinite(quote.price)) quote.refreshFailed = true;
    $('connection-status').textContent = '行情更新失敗';
    notice(`無法更新行情：${error.message}；舊資料依來源時間標示。`);
  } finally {
    state.snapshotRunning = false; $('refresh').disabled = false; $('refresh').classList.remove('busy');
    renderQuotes(); renderAnalysis();
  }
}

function renderMarkets() {
  $('market-grid').innerHTML = ASSETS.map(asset => {
    const q = state.quotes[asset.id], status = quoteState(q);
    return `<article class="market-item"><h2>${asset.name}</h2><div class="market-price">${fmt(q?.price)}${asset.kind === 'yield' && Number.isFinite(q?.price) ? '%' : ''}</div><p>${asset.unit}${asset.proxy ? ' · TLT ETF 代理' : ''}<br><span class="${tone(q?.changePercent ?? q?.changeBps)}">${esc(quoteChange(q))}</span></p><div class="quote-meta">${esc(q?.source || '待查詢')}<br>${q?.asOf ? esc(timestamp(q.asOf, 'Asia/Taipei', q.precision === 'date')) : esc(q?.reason || '無可用資料')}</div><div class="market-actions"><span class="status-tag">${statusNames[status]}</span><button class="icon-button" data-quote="${asset.id}" title="查詢${asset.name}報價" aria-label="查詢${asset.name}報價" ${state.busy.has(asset.id) ? 'disabled' : ''}><i data-lucide="refresh-cw"></i></button></div></article>`;
  }).join(''); icons();
}
async function loadSingleQuote(id) {
  if (state.busy.has(id)) return;
  state.busy.add(id); renderMarkets();
  try {
    const quote = await api(`/api/quote?asset=${encodeURIComponent(id)}`);
    state.quotes[id] = quote;
    if (quote.status === 'unavailable') notice(quote.reason);
  } catch (error) { notice(error.message); }
  finally { state.busy.delete(id); renderQuotes(); }
}

async function loadNews() {
  $('news-list').innerHTML = '<div class="empty-state">正在取得來源公告…</div>';
  try {
    const data = await api('/api/news'); state.newsLoaded = true;
    $('news-time').textContent = `擷取 ${timestamp(data.fetchedAt)}`;
    $('news-list').innerHTML = data.items.map(item => `<article class="news-item"><div class="meta"><div>${esc(item.source)}</div><div>${timestamp(item.publishedAt)}</div></div><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></article>`).join('') || '<div class="empty-state">來源未提供有效新聞，未以示意消息替代。</div>';
    if (data.errors.length) $('news-list').insertAdjacentHTML('beforeend', `<p class="muted">${data.errors.map(esc).join('；')}</p>`);
  } catch (error) { $('news-list').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
}

function loadHeatmap() {
  const container = $('heatmap-wrapper'); container.replaceChildren();
  const wrapper = document.createElement('div'); wrapper.className = 'tradingview-widget-container';
  const target = document.createElement('div'); target.className = 'tradingview-widget-container__widget'; target.style.height = '100%'; wrapper.append(target);
  const script = document.createElement('script'); script.async = true;
  script.src = $('heatmap-type').value === 'forex' ? 'https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js' : 'https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js';
  script.textContent = JSON.stringify({ width: '100%', height: '100%', currencies: ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD'], dataSource: 'Crypto', blockSize: 'market_cap_calc', blockColor: '24h_close_change|5', locale: 'zh_TW', colorTheme: 'light', isTransparent: true });
  script.onerror = () => { container.innerHTML = '<div class="empty-state">TradingView 連線失敗</div>'; };
  wrapper.append(script); container.append(wrapper);
}

function renderCalendar() {
  const zone = $('timezone').value;
  $('calendar-rows').innerHTML = state.calendar.length ? state.calendar.map(event => `<tr><td>${timestamp(event.date, zone)}</td><td>${esc(event.title)}<div class="sample">${event.impact === 'High' ? '高影響' : '中影響'}</div></td><td>${event.date ? marketSessions(event.date).join('／') : '未確認'}</td><td>${esc(event.previous)}</td><td>${esc(event.forecast)}</td><td class="muted">未提供</td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">沒有可顯示的本週事件</td></tr>';
}
async function loadCalendar() {
  $('calendar-status').textContent = '正在更新';
  try {
    const data = await api('/api/calendar'); state.calendar = data.events; state.calendarLoaded = true;
    $('calendar-status').textContent = `第三方日曆 · ${timestamp(data.fetchedAt)}`;
    renderCalendar();
  } catch (error) { $('calendar-status').textContent = '日曆取得失敗'; notice(error.message); renderCalendar(); }
}
function renderMacro() {
  const event = MACRO.find(item => item.id === $('macro-event').value);
  const result = macroSurprise(event.id, $('macro-actual').value, $('macro-forecast').value);
  $('macro-unit').textContent = `單位：${event.unit}`;
  $('macro-result').innerHTML = `<h3 class="${result ? tone(result.impact) : ''}">${result ? result.label : '等待公布值與預期值'}</h3><p>${event.above}</p><p>${event.caveat}</p><p>常見公布時間：紐約 ${event.time} · 主要影響美盤，可能延續至下一亞／歐盤。影響觀察：${event.period}。</p>`;
}

function renderHistory() {
  const entries = Object.entries(state.history);
  $('history-list').innerHTML = entries.length ? entries.map(([id, data]) => `<div class="history-entry"><div><strong>${esc(ASSETS.find(a => a.id === id)?.name || id)}</strong><p>${esc(data.source)} · ${esc(data.boundary || 'CSV 收盤日界線尚未驗證')}</p></div><span>${data.bars.length} 筆<br><span class="muted">${data.bars[0]?.date}–${data.bars.at(-1)?.date}</span></span></div>`).join('') : '<div class="empty-state">尚無歷史日資料</div>';
}
function renderAudit() {
  $('audit-rows').innerHTML = ASSETS.map(asset => {
    const q = state.quotes[asset.id], status = quoteState(q);
    return `<tr><td>${asset.name}<div class="sample">${asset.unit}</div></td><td>${esc(q?.source || '未連線')}<div class="sample">${esc(q?.symbol || asset.symbol)} · ${esc(q?.note || q?.reason || '')}</div></td><td>${timestamp(q?.asOf, 'Asia/Taipei', q?.precision === 'date')}</td><td>${statusNames[status]}</td></tr>`;
  }).join('');
  compareBroker();
}
function compareBroker() {
  const input = $('broker-price').value, gold = state.quotes.GOLD;
  if (!input || !(Number(input) > 0) || !Number.isFinite(gold?.price)) { $('quote-difference').textContent = '尚未比較'; return; }
  const difference = Number(input) - gold.price;
  $('quote-difference').textContent = `cTrader 參考價 − 公開現貨：${signed(difference)} USD（${signed(difference / gold.price * 100)}%）；未連線券商，需比對同時點 bid／ask。${quoteState(gold) !== 'recent' ? '公開行情已過期或時間未知。' : ''}`;
}
async function loadHistory() {
  const id = $('history-asset').value;
  $('history-status').textContent = '正在取得已收盤日資料';
  try {
    const data = await api(`/api/history?asset=${encodeURIComponent(id)}`);
    state.history[id] = data; renderHistory(); renderAnalysis();
    $('history-status').textContent = `已取得 ${data.bars.length} 筆`;
  } catch (error) { $('history-status').textContent = error.message; }
}
function download(name, value, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([type === 'application/json' ? JSON.stringify(value, null, 2) : value], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setTab() {
  const tab = ['simulation', 'markets', 'macro', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'simulation';
  state.tab = tab;
  $('mobile-summary').hidden = tab !== 'simulation';
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== `view-${tab}`; });
  document.querySelectorAll('.nav-link').forEach(link => { link.classList.toggle('active', link.hash === `#${tab}`); if (link.hash === `#${tab}`) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  if (tab === 'simulation') renderAnalysis();
  if (tab === 'markets') { renderMarkets(); if (!state.newsLoaded) loadNews(); }
  if (tab === 'macro' && !state.calendarLoaded) loadCalendar();
  if (tab === 'settings') { renderHistory(); renderAudit(); }
}

function setup() {
  analysisTask = createAnalysisTask(running => {
    updateAnalysisButton();
    $('ai-output').setAttribute('aria-busy', String(running));
    for (const id of ['ai-provider', 'analysis-token', 'analysis-api-key', 'analysis-model']) $(id).disabled = running;
  });
  $('regime').innerHTML = Object.entries(REGIMES).map(([id, item]) => `<option value="${id}">${item.name}</option>`).join('');
  $('history-asset').innerHTML = ASSETS.map(item => `<option value="${item.id}">${item.name} / ${item.symbol}</option>`).join('');
  $('macro-event').innerHTML = MACRO.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
  $('macro-guide').innerHTML = MACRO.map(item => `<article><div><h3>${item.name}</h3><a href="${esc(item.source)}" target="_blank" rel="noopener">官方來源與發布時間</a></div><div><p>${item.above}</p><p>${item.caveat} 觀察期間：${item.period}。</p></div></article>`).join('');
  renderFactors(); renderSaved(); renderMacro(); renderQuotes(); setTab(); icons();
  $('factor-rows').addEventListener('change', event => {
    const row = event.target.closest('[data-factor]'); if (!row) return;
    state.directions[row.dataset.factor] = Number(event.target.value); $('ai-output').hidden = true; renderAnalysis();
  });
  for (const name of ['regime', 'strength', 'window', 'horizon']) $(name).addEventListener('input', () => {
    state[name] = name === 'regime' ? $(name).value : Number($(name).value);
    $('strength-value').value = `${state.strength.toFixed(1)}×`; $('ai-output').hidden = true; renderAnalysis();
  });
  $('preset').addEventListener('change', () => {
    const presets = { dovish: { directions: { DXY: -1, REAL10Y: -1, SILVER: 1 }, regime: 'normal' }, hawkish: { directions: { DXY: 1, REAL10Y: 1 }, regime: 'hawkish' }, haven: { directions: { DXY: 1, SPX: -1 }, regime: 'haven' }, liquidity: { directions: { WTI: -1, SPX: -1, DXY: 1, BTC: -1 }, regime: 'liquidity' } };
    if (presets[$('preset').value]) setScenario(presets[$('preset').value]);
    $('preset').value = '';
  });
  $('reset-scenario').addEventListener('click', () => setScenario({}));
  $('mobile-summary').addEventListener('click', () => $('scenario-summary').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }));
  $('save-scenario').addEventListener('click', () => {
    const name = prompt('情境名稱'); if (!name?.trim()) return;
    saved = [{ name: name.trim().slice(0, 40), directions: { ...state.directions }, regime: state.regime, strength: state.strength }, ...saved].slice(0, 10); localWrite('paw-gold-scenarios-v2', saved); renderSaved();
  });
  $('saved-scenarios').addEventListener('click', event => {
    const load = event.target.closest('[data-load]'), remove = event.target.closest('[data-delete]');
    if (load) setScenario(saved[Number(load.dataset.load)]);
    if (remove) { saved.splice(Number(remove.dataset.delete), 1); localWrite('paw-gold-scenarios-v2', saved); renderSaved(); }
  });
  $('export-scenario').addEventListener('click', () => download('gold-scenario.json', { ...Object.fromEntries(['directions', 'regime', 'strength', 'window', 'horizon'].map(key => [key, state[key]])), study: state.study, quotes: state.quotes, exportedAt: new Date().toISOString(), warning: '未校準假設與歷史條件頻率，不是未來預測' }));
  $('refresh').addEventListener('click', refreshSnapshot);
  $('market-grid').addEventListener('click', event => { const button = event.target.closest('[data-quote]'); if (button) loadSingleQuote(button.dataset.quote); });
  $('refresh-news').addEventListener('click', () => busy($('refresh-news'), loadNews));
  $('refresh-calendar').addEventListener('click', () => busy($('refresh-calendar'), loadCalendar));
  $('timezone').addEventListener('change', renderCalendar);
  $('load-heatmap').addEventListener('click', loadHeatmap);
  $('heatmap-type').addEventListener('change', () => { $('heatmap-wrapper').innerHTML = '<div class="empty-state">TradingView 尚未連線</div>'; });
  for (const id of ['macro-event', 'macro-actual', 'macro-forecast']) $(id).addEventListener('input', renderMacro);
  $('load-history').addEventListener('click', () => busy($('load-history'), loadHistory));
  $('csv-import').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('CSV 上限為 8 MB。');
      const imported = parseHistoryCsv(await file.text());
      // Replace as one dataset to avoid silently mixing incompatible imports.
      state.history = imported; $('history-status').textContent = `已匯入 ${file.name}`; renderHistory(); renderAnalysis(); notice('CSV 已在本機載入；請確認所有品項為相同日收盤定義。');
    } catch (error) { notice(error.message); }
    event.target.value = '';
  });
  $('csv-template').addEventListener('click', () => download('history-format.csv', 'date,asset,close\n', 'text/csv;charset=utf-8'));
  $('clear-history').addEventListener('click', () => { state.history = {}; $('history-status').textContent = ''; renderHistory(); renderAnalysis(); });
  $('broker-price').addEventListener('input', compareBroker);
  $('ai-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (analysisTask.running) return;
    $('ai-output').hidden = false;
    try {
      await analysisTask.run(async signal => {
        const question = $('ai-question').value.trim();
        if (!question) { $('ai-question').focus(); throw new Error('請先填寫研究問題。'); }
        $('ai-output').textContent = '正在確認 AI 設定…';
        await refreshConfig({ signal });
        const token = $('settings-token').value || $('analysis-token').value || adminToken;
        if (!state.config.localAdmin && !token) throw new Error('請填寫管理存取碼；Gemini API Key 請放在另一個專用欄位。');
        const provider = $('ai-provider').value;
        if (provider === 'gemini') await prepareGemini(signal);
        else if (!state.config.openai) throw new Error('尚未設定 OpenAI，請改選 Gemini 或先完成伺服器設定。');
        $('ai-output').textContent = 'AI 正在分析… 若超過等待上限會自動停止；未傳送 CSV。';
        const data = await api('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, directions: state.directions, regime: state.regime, strength: state.strength, question }), signal });
        $('ai-output').textContent = `${data.text}\n\n${data.provider} / ${data.model} · ${timestamp(data.generatedAt)}\n${data.evidence}\n${data.disclaimer}`;
      });
    } catch (error) { $('ai-output').textContent = error.message || '分析失敗，請重試。'; }
  });
  $('ai-cancel').addEventListener('click', () => analysisTask.cancel());
  $('ai-retry-config').addEventListener('click', () => busy($('ai-retry-config'), async () => {
    try { await refreshConfig(); }
    catch (error) { $('ai-status').textContent = error.message; }
  }));
  $('ai-provider').addEventListener('change', () => { providerTouched = true; updateAnalysisButton(); });
  for (const id of ['analysis-api-key', 'gemini-api-key']) $(id).addEventListener('input', updateAnalysisButton);
  for (const [source, target] of [['analysis-model', 'gemini-model'], ['gemini-model', 'analysis-model']]) $(source).addEventListener('input', () => { $(target).value = $(source).value; });
  for (const id of ['settings-token', 'analysis-token']) $(id).addEventListener('input', () => {
    adminToken = $(id).value;
    $('settings-token').value = adminToken; $('analysis-token').value = adminToken;
  });
  $('copy-admin-token').addEventListener('click', () => keyAction($('copy-admin-token'), async () => {
    const data = await api('/api/local-admin-token');
    await navigator.clipboard.writeText(data.token);
    $('gemini-settings-result').textContent = '管理存取碼已複製。它可管理線上 AI 額度，請勿分享。';
  }));
  $('gemini-settings').addEventListener('submit', event => {
    event.preventDefault();
    keyAction($('gemini-save'), async () => {
      const key = $('gemini-api-key').value.trim();
      const result = await api('/api/settings/gemini', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key, model: $('gemini-model').value }) });
      applySavedGemini(result, key);
      $('gemini-settings-result').textContent = 'Key 已加密保存在後端；關閉或重新整理不會清除。尚未進行連線測試。';
    });
  });
  $('gemini-models').addEventListener('click', () => keyAction($('gemini-models'), async () => {
    const data = await api('/api/settings/gemini/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: $('gemini-api-key').value }) });
    $('gemini-model-list').innerHTML = data.models.map(model => `<option value="${esc(model.id)}">${esc(model.name)}</option>`).join('');
    if (!$('gemini-model').value && data.models.length) $('gemini-model').value = (data.models.find(model => model.id === 'gemini-flash-latest') || data.models.find(model => /flash/.test(model.id)) || data.models[0]).id;
    $('analysis-model').value = $('gemini-model').value;
    $('gemini-settings-result').textContent = `取得 ${data.models.length} 個文字生成模型；模型選擇與額度依 Google 帳戶權限。尚未儲存變更。`;
  }));
  $('gemini-test').addEventListener('click', () => keyAction($('gemini-test'), async () => {
    const data = await api('/api/settings/gemini/test', { method: 'POST' });
    $('gemini-settings-result').textContent = `連線成功 · ${data.model} · ${timestamp(data.testedAt)}`;
  }));
  $('gemini-delete').addEventListener('click', () => {
    $('gemini-delete-dialog').returnValue = '';
    $('gemini-delete-dialog').showModal();
  });
  $('gemini-delete-dialog').addEventListener('close', () => {
    if ($('gemini-delete-dialog').returnValue !== 'delete') return;
    keyAction($('gemini-delete'), async () => {
      await api('/api/settings/gemini', { method: 'DELETE' });
      $('gemini-api-key').value = ''; $('analysis-api-key').value = ''; $('gemini-model').value = ''; $('analysis-model').value = '';
      applyConfig({ ...state.config, gemini: false, geminiSettings: { ...state.config.geminiSettings, saved: false, legacy: false, available: false, disabled: true, model: null } });
      $('gemini-settings-result').textContent = '本系統保存的 Key 已刪除，後續分析不再使用它。已送出的請求不受影響。';
    });
  });
  $('manage-gemini').addEventListener('click', () => { $('gemini-settings').scrollIntoView({ block: 'center' }); $('gemini-api-key').focus({ preventScroll: true }); });
  window.addEventListener('hashchange', setTab);
  window.addEventListener('resize', () => drawContributions(scenarioScore(state.directions, state.regime, state.strength)));
  document.addEventListener('visibilitychange', () => { renderQuotes(); if (!document.hidden) refreshSnapshot(); });
  window.addEventListener('pagehide', () => analysisTask.cancel());
  updateAnalysisButton();
  refreshConfig().catch(error => { $('ai-status').textContent = '連線設定取得失敗'; notice(error.message); });
  refreshSnapshot();
  setInterval(refreshSnapshot, 60000);
  setInterval(renderQuotes, 15000);
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('./sw.js').catch(() => notice('離線快取無法啟用；線上功能仍可使用。'));
}

try {
  const config = await withDeadline(async signal => {
    const response = await fetch(new URL('./runtime-config.json', import.meta.url), { cache: 'no-store', signal });
    if (!response.ok) throw new Error('Runtime configuration unavailable');
    return response.json();
  }, { timeoutMs: 8000 });
  if (config.apiBase) {
    const url = new URL(config.apiBase);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid API origin');
    apiBase = url.origin;
  }
} catch { if (location.hostname.endsWith('github.io')) notice('未取得後端連線設定，請確認 GitHub Pages 已透過新版建置流程發布。'); }
setup();
