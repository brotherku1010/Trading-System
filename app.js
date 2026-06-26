// PAW Trading Dashboard - Core JS Logic

// 1. Cloudflare Workers Proxy URL Configuration
// -------------------------------------------------------------
const WORKER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'https://tradingsystem.jppsku.workers.dev' 
  : window.location.origin;
// -------------------------------------------------------------

// 2. Application State
const state = {
  activeAsset: 'XAUUSD', // 'XAUUSD', 'BTCUSD', 'ETHUSD'
  activeTab: 'charts'   // 'charts', 'sentiment', 'macro'
};

// Asset Map config
const assetConfig = {
  XAUUSD: {
    name: '🥇 黃金 (XAUUSD)',
    symbol: 'OANDA:XAUUSD',
    feedSymbol: 'XAUUSD',
    sentiment: {
      source: 'OANDA 掛單多空比 (離線)',
      longRatio: 54,
      shortRatio: 46,
      details: [
        { label: '大戶持倉比率', value: '58% 多 / 42% 空', trend: 'up' },
        { label: '壓力區間 (Resistance)', value: '4020 - 4050', trend: 'neutral' },
        { label: '支撐區間 (Support)', value: '3940 - 3970', trend: 'up' }
      ]
    }
  },
  BTCUSD: {
    name: '🪙 比特幣 (BTCUSD)',
    symbol: 'BINANCE:BTCUSDT',
    feedSymbol: 'BTC',
    sentiment: {
      source: 'Coinglass 全網合約多空比 (離線)',
      longRatio: 51.5,
      shortRatio: 48.5,
      details: [
        { label: '24h 爆倉金額', value: '多單 $1,240萬 / 空單 $890萬', trend: 'down' },
        { label: '資金費率 (Funding Rate)', value: '+0.0125% / 8h', trend: 'up' },
        { label: '未平倉量 (OI)', value: '$18.4 B (增加 2.4%)', trend: 'up' }
      ]
    }
  },
  ETHUSD: {
    name: '💎 以太幣 (ETHUSD)',
    symbol: 'BINANCE:ETHUSDT',
    feedSymbol: 'ETH',
    sentiment: {
      source: 'Coinglass 全網合約多空比 (離線)',
      longRatio: 48.2,
      shortRatio: 51.8,
      details: [
        { label: '24h 爆倉金額', value: '多單 $620萬 / 空單 $750萬', trend: 'up' },
        { label: '資金費率 (Funding Rate)', value: '+0.0085% / 8h', trend: 'neutral' },
        { label: 'Gas 費率', value: '18 Gwei', trend: 'down' }
      ]
    }
  }
};

// Macro Data Calendar Mock (Fallback data)
const macroCalendar = [
  { time: '週四 20:30', currency: 'USD', event: '核心 PCE 物價指數年率 (PCE Inflation)', impact: 'high', previous: '2.6%', forecast: '2.5%' },
  { time: '週四 20:30', currency: 'USD', event: '初請失業金人數 (Unemployment Claims)', impact: 'medium', previous: '238K', forecast: '240K' },
  { time: '週五 22:00', currency: 'USD', event: '密西根大學消費者信心指數終值', impact: 'medium', previous: '65.6', forecast: '66.0' },
  { time: '下週三 02:00', currency: 'USD', event: '美聯儲利率決議 (Fed Interest Rate Decision)', impact: 'high', previous: '5.50%', forecast: '5.50%' },
  { time: '下週五 20:30', currency: 'USD', event: '非農就業人口變動 (NFP) / 失業率', impact: 'high', previous: '272K / 4.0%', forecast: '185K / 4.0%' }
];

// News ticker initial list (Fallback data)
const newsTickerData = [
  "🔥 即時快訊：美國 PCE 數據發佈前夕，市場情緒偏向保守",
  "⚡ 加密貨幣：比特幣在 $64,000 關卡持續震盪，以太坊現貨 ETF 審批迎來新進展",
  "📊 宏觀經濟：美國十年期國債收益率跌至 4.23%，美元指數微跌",
  "🪙 鏈上數據：某巨鯨於過去 2 小時向 Binance 轉入 1,200 枚 BTC，價值約 7,680 萬美元",
  "💎 黃金分析：地緣政治風險稍緩，黃金在 2330 美元附近尋求底部支撐"
];

// 3. Initialize App
window.addEventListener('DOMContentLoaded', () => {
  setupMarquee();
  fetchMarketData();
  loadHeatmap();
  renderSentiment();
  renderMacro();
  setupEventListeners();
  registerServiceWorker();
  
  // Update market data every 10 seconds
  setInterval(() => {
    if (state.activeTab === 'charts') {
      fetchMarketData();
    }
  }, 10000);
});

// 4. Setup Marquee News Ticker (Fetches live or falls back)
async function setupMarquee() {
  const marqueeContent = document.getElementById('marquee-content');
  if (!marqueeContent) return;
  
  let newsList = [...newsTickerData];
  
  if (WORKER_URL) {
    try {
      const response = await fetch(`${WORKER_URL}/news`);
      if (response.ok) {
        const liveNews = await response.json();
        if (Array.isArray(liveNews) && liveNews.length > 0) {
          newsList = liveNews.map(item => `🔥 ${item}`);
          console.log('[Live Data] Loaded news ticker from Cloudflare Worker');
        }
      }
    } catch (err) {
      console.warn('[Fallback] Failed to fetch news from Worker, using mock data:', err);
    }
  }
  
  const combinedNews = newsList.join('    |    ');
  marqueeContent.innerHTML = `<span class="px-4">${combinedNews}</span><span class="px-4">${combinedNews}</span>`;
}

// 5. Fetch Price & Rumor Data (Market Intelligence Tab)
async function fetchMarketData() {
  const priceDisplay = document.getElementById('spot-price-display');
  const badgeEl = document.getElementById('price-change-badge');
  const assetNameEl = document.getElementById('active-asset-name');
  const highEl = document.getElementById('price-high');
  const lowEl = document.getElementById('price-low');
  
  const rsiEl = document.getElementById('status-rsi');
  const macdEl = document.getElementById('status-macd');
  const trendEl = document.getElementById('status-trend');
  
  const fngValueEl = document.getElementById('fng-value');
  const fngClassEl = document.getElementById('fng-class');
  const fngBarFill = document.getElementById('fng-bar-fill');
  
  const rumorsContainer = document.getElementById('rumors-container');
  
  if (!priceDisplay) return;
  
  try {
    const response = await fetch(`${WORKER_URL}/market-data?asset=${state.activeAsset}`);
    if (response.ok) {
      const data = await response.json();
      
      // Update Asset Display Name
      if (assetNameEl) {
        assetNameEl.textContent = state.activeAsset === 'XAUUSD' ? '🥇 黃金 Spot' : (state.activeAsset === 'BTCUSD' ? '🪙 BTC' : '💎 ETH');
      }
      
      // Format & Render Price Data
      const formattedPrice = state.activeAsset === 'XAUUSD' 
        ? `$${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${data.price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
      priceDisplay.textContent = formattedPrice;
      
      const formattedHigh = state.activeAsset === 'XAUUSD' 
        ? `$${data.high.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${data.high.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
      const formattedLow = state.activeAsset === 'XAUUSD' 
        ? `$${data.low.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${data.low.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;
      
      if (highEl) highEl.textContent = formattedHigh;
      if (lowEl) lowEl.textContent = formattedLow;
      
      // Render Change Badges
      const isPositive = data.changePercent >= 0;
      if (badgeEl) {
        badgeEl.textContent = `${isPositive ? '+' : ''}${data.changePercent.toFixed(2)}%`;
        badgeEl.className = `px-2 py-0.5 rounded font-bold text-[10px] ${
          isPositive 
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
        }`;
      }
      
      // Render Status Indicators
      if (rsiEl) rsiEl.textContent = data.rsi;
      if (macdEl) macdEl.textContent = data.macd;
      if (trendEl) {
        trendEl.textContent = data.trend;
        if (data.trend.includes("多頭")) {
          trendEl.className = "font-bold text-emerald-400";
        } else if (data.trend.includes("空頭")) {
          trendEl.className = "font-bold text-rose-400";
        } else {
          trendEl.className = "font-bold text-yellow-400";
        }
      }
      
      // Render Fear & Greed Index
      if (fngValueEl && fngClassEl && fngBarFill) {
        fngValueEl.textContent = data.fearGreed.value;
        fngClassEl.textContent = getFearGreedChinese(data.fearGreed.classification);
        fngBarFill.style.width = `${data.fearGreed.value}%`;
        
        const fngClass = data.fearGreed.classification.toLowerCase();
        if (fngClass.includes('fear')) {
          fngClassEl.className = "text-xs font-bold text-rose-400";
        } else if (fngClass.includes('greed')) {
          fngClassEl.className = "text-xs font-bold text-emerald-400";
        } else {
          fngClassEl.className = "text-xs font-bold text-yellow-400";
        }
      }
      
      // Render Dynamic Whispers & Rumors
      if (rumorsContainer) {
        let rumorsHtml = '';
        data.rumors.forEach(rumor => {
          rumorsHtml += `
            <div class="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 space-y-1.5 hover:bg-slate-800/60 transition-colors">
              <div class="flex justify-between items-center text-[10px]">
                <span class="px-2 py-0.5 border rounded font-bold ${rumor.badgeColor}">${rumor.type}</span>
                <span class="text-slate-500 font-mono">${rumor.time}</span>
              </div>
              <p class="text-slate-300 text-xs leading-relaxed">${rumor.content}</p>
            </div>
          `;
        });
        rumorsContainer.innerHTML = rumorsHtml;
      }
    }
  } catch (err) {
    console.error('Failed to load market intelligence data:', err);
  }
}

// Convert Fear Greed label to Traditional Chinese
function getFearGreedChinese(englishClass) {
  const mapping = {
    'Extreme Fear': '極度恐懼 (Extreme Fear)',
    'Fear': '恐懼 (Fear)',
    'Neutral': '中立 (Neutral)',
    'Greed': '貪婪 (Greed)',
    'Extreme Greed': '極度貪婪 (Extreme Greed)'
  };
  return mapping[englishClass] || englishClass;
}

// 6. Dynamically Load Heatmap scripts (Forex/Crypto)
function loadHeatmap() {
  const container = document.getElementById('heatmap-wrapper');
  if (!container) return;
  
  // Clear previous instance
  container.innerHTML = '';
  
  // Create wrapper structures
  const widgetContainer = document.createElement('div');
  widgetContainer.className = 'tradingview-widget-container h-full w-full';
  
  const widgetSub = document.createElement('div');
  widgetSub.className = 'tradingview-widget-container__widget h-full w-full';
  widgetContainer.appendChild(widgetSub);
  
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.async = true;
  
  if (state.activeAsset === 'XAUUSD') {
    // Load Forex Heatmap for Gold Spot Context
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js';
    script.innerHTML = JSON.stringify({
      "width": "100%",
      "height": "100%",
      "currencies": ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD"],
      "isTransparent": true,
      "colorTheme": "dark",
      "locale": "zh_TW"
    });
  } else {
    // Load Crypto Coins Heatmap for BTC / ETH
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js';
    script.innerHTML = JSON.stringify({
      "dataSource": "Crypto",
      "blockSize": "market_cap_calc",
      "blockColor": "24h_close_change|5",
      "locale": "zh_TW",
      "colorTheme": "dark",
      "isZoomEnabled": true,
      "hasSymbolTooltip": true,
      "width": "100%",
      "height": "100%"
    });
  }
  
  widgetContainer.appendChild(script);
  container.appendChild(widgetContainer);
}

// 7. Render Sentiment Tab Data (Fetches live or falls back)
async function renderSentiment() {
  const config = assetConfig[state.activeAsset];
  const sentimentSection = document.getElementById('sentiment-data-container');
  if (!sentimentSection) return;
  
  sentimentSection.innerHTML = `
    <div class="flex flex-col items-center justify-center py-16">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
      <p class="text-xs text-slate-400 mt-4">正在讀取最新籌碼數據...</p>
    </div>
  `;
  
  let sentimentData = { ...config.sentiment };
  
  if (WORKER_URL) {
    try {
      const response = await fetch(`${WORKER_URL}/sentiment?asset=${state.activeAsset}`);
      if (response.ok) {
        const liveSentiment = await response.json();
        if (liveSentiment && liveSentiment.longRatio !== undefined) {
          sentimentData = liveSentiment;
          console.log(`[Live Data] Loaded ${state.activeAsset} sentiment from Worker`);
        }
      }
    } catch (err) {
      console.warn('[Fallback] Failed to fetch sentiment from Worker, using mock data:', err);
    }
  }
  
  const longPercent = sentimentData.longRatio;
  const shortPercent = sentimentData.shortRatio;
  
  let detailsHtml = '';
  sentimentData.details.forEach(item => {
    let icon = '➡️';
    let colorClass = 'text-gray-400';
    if (item.trend === 'up') {
      icon = '↗️';
      colorClass = 'text-neon-green';
    } else if (item.trend === 'down') {
      icon = '↘️';
      colorClass = 'text-neon-red';
    }
    
    detailsHtml += `
      <div class="flex justify-between items-center p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <span class="text-slate-400 text-sm">${item.label}</span>
        <span class="font-medium text-sm ${colorClass} flex items-center gap-1">
          ${item.value} ${icon}
        </span>
      </div>
    `;
  });
  
  sentimentSection.innerHTML = `
    <div class="mb-4 text-center">
      <h3 class="text-lg font-semibold text-white">${config.name} 籌碼觀測</h3>
      <p class="text-xs text-slate-400 mt-1">數據來源：${sentimentData.source}</p>
    </div>
    
    <div class="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 mb-4 shadow-xl">
      <div class="flex justify-between text-sm mb-2 font-bold">
        <span class="text-neon-green">LONG 多頭 (${longPercent}%)</span>
        <span class="text-neon-red">SHORT 空頭 (${shortPercent}%)</span>
      </div>
      
      <div class="ratio-bar w-full">
        <div class="ratio-fill" style="width: ${longPercent}%"></div>
      </div>
      
      <div class="flex justify-between text-xs text-slate-400 mt-3">
        <span>多單優勢</span>
        <span>${longPercent > shortPercent ? '多頭佔優' : '空頭佔優'}</span>
        <span>空單優勢</span>
      </div>
    </div>
    
    <div class="space-y-3">
      ${detailsHtml}
    </div>
    
    <div class="mt-6 p-4 bg-slate-900/60 rounded-2xl border border-dashed border-slate-700 text-center">
      <p class="text-xs text-slate-400 mb-2">🔥 籌碼熱力圖 (Coinglass 嵌入預留區)</p>
      <div class="aspect-video w-full bg-slate-800 rounded-lg flex items-center justify-center text-xs text-slate-500">
        [${config.feedSymbol} Coinglass Liquidation Map API / Iframe Placeholder]
      </div>
    </div>
  `;
}

// 8. Render Macro Tab Data (Fetches live or falls back)
async function renderMacro() {
  const container = document.getElementById('macro-data-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="flex flex-col items-center justify-center py-16">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
      <p class="text-xs text-slate-400 mt-4">正在讀取當週財經日曆...</p>
    </div>
  `;
  
  let eventsList = [...macroCalendar];
  
  if (WORKER_URL) {
    try {
      const response = await fetch(`${WORKER_URL}/macro`);
      if (response.ok) {
        const liveEvents = await response.json();
        if (Array.isArray(liveEvents) && liveEvents.length > 0) {
          eventsList = liveEvents;
          console.log('[Live Data] Loaded macroeconomic calendar from Worker');
        }
      }
    } catch (err) {
      console.warn('[Fallback] Failed to fetch macro calendar from Worker, using mock data:', err);
    }
  }
  
  let calendarHtml = '';
  eventsList.forEach(item => {
    let impactBadge = '';
    if (item.impact === 'high') {
      impactBadge = '<span class="px-2 py-0.5 text-[10px] font-bold rounded badge-high">高重要度 (High)</span>';
    } else if (item.impact === 'medium') {
      impactBadge = '<span class="px-2 py-0.5 text-[10px] font-bold rounded badge-medium">中重要度 (Med)</span>';
    } else {
      impactBadge = '<span class="px-2 py-0.5 text-[10px] font-bold rounded badge-low">低重要度 (Low)</span>';
    }
    
    calendarHtml += `
      <div class="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 shadow-md">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs text-slate-400 font-medium">${item.time} (${item.currency})</span>
          ${impactBadge}
        </div>
        <h4 class="text-sm font-semibold text-white mb-3">${item.event}</h4>
        <div class="grid grid-cols-2 gap-4 text-xs">
          <div class="bg-slate-900/40 p-2 rounded-lg">
            <span class="text-slate-400 block mb-0.5">預測值 (Forecast)</span>
            <span class="text-white font-medium">${item.forecast}</span>
          </div>
          <div class="bg-slate-900/40 p-2 rounded-lg">
            <span class="text-slate-400 block mb-0.5">前值 (Previous)</span>
            <span class="text-white font-medium">${item.previous}</span>
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = `
    <div class="mb-4 text-center">
      <h3 class="text-lg font-semibold text-white">📅 宏觀財經日曆 (當週)</h3>
      <p class="text-xs text-slate-400 mt-1">數據來源：ForexFactory (重大紅標數據過濾)</p>
    </div>
    
    <div class="mb-4 grid grid-cols-2 gap-3">
      <div class="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 flex justify-between items-center">
        <span class="text-xs text-slate-400">💵 美元指數 (DXY)</span>
        <span class="text-xs font-bold text-neon-red">105.82 (-0.12%)</span>
      </div>
      <div class="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 flex justify-between items-center">
        <span class="text-xs text-slate-400">🛢️ 美原油 (USOIL)</span>
        <span class="text-xs font-bold text-neon-green">$81.45 (+0.42%)</span>
      </div>
    </div>

    <div class="space-y-3">
      ${calendarHtml}
    </div>
  `;
}

// 9. Setup Event Listeners (Assets & Navigation Tabs)
function setupEventListeners() {
  // Asset Selectors
  const assetButtons = document.querySelectorAll('.asset-btn');
  assetButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selected = e.currentTarget.dataset.asset;
      if (selected === state.activeAsset) return;
      
      state.activeAsset = selected;
      
      assetButtons.forEach(b => {
        b.classList.remove('text-yellow-400', 'font-bold', 'border-b-2', 'border-yellow-400');
        b.classList.add('text-slate-400');
      });
      e.currentTarget.classList.remove('text-slate-400');
      e.currentTarget.classList.add('text-yellow-400', 'font-bold', 'border-b-2', 'border-yellow-400');
      
      // Update Tab Views based on active tab
      if (state.activeTab === 'charts') {
        fetchMarketData();
        loadHeatmap();
      } else if (state.activeTab === 'sentiment') {
        renderSentiment();
      }
    });
  });

  // Tab Selectors
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedTab = e.currentTarget.dataset.tab;
      if (selectedTab === state.activeTab) return;
      
      state.activeTab = selectedTab;
      
      tabButtons.forEach(b => {
        b.classList.remove('text-blue-400');
        b.classList.add('text-slate-400');
      });
      e.currentTarget.classList.remove('text-slate-400');
      e.currentTarget.classList.add('text-blue-400');
      
      tabPanes.forEach(pane => {
        pane.classList.remove('active', 'block');
        pane.classList.add('hidden');
        if (pane.id === `tab-${selectedTab}`) {
          pane.classList.remove('hidden');
          setTimeout(() => {
            pane.classList.add('active');
          }, 50);
        }
      });
      
      if (selectedTab === 'charts') {
        fetchMarketData();
        loadHeatmap();
      } else if (selectedTab === 'sentiment') {
        renderSentiment();
      } else if (selectedTab === 'macro') {
        renderMacro();
      }
    });
  });
}

// 10. Register Service Worker for PWA
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('[Service Worker] Registered successfully:', reg.scope))
      .catch((err) => console.error('[Service Worker] Registration failed:', err));
  }
}
