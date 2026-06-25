// PAW Trading Dashboard - Core JS Logic

// 1. Application State
const state = {
  activeAsset: 'XAUUSD', // 'XAUUSD', 'BTCUSD', 'ETHUSD'
  activeTab: 'charts',   // 'charts', 'sentiment', 'macro'
  tvWidget: null
};

// Asset Map config
const assetConfig = {
  XAUUSD: {
    name: '🥇 黃金 (XAUUSD)',
    symbol: 'OANDA:XAUUSD',
    feedSymbol: 'XAUUSD',
    sentiment: {
      source: 'OANDA 掛單多空比',
      longRatio: 54,
      shortRatio: 46,
      details: [
        { label: '大戶持倉比率', value: '58% 多 / 42% 空', trend: 'up' },
        { label: '壓力區間 (Resistance)', value: '2350 - 2365', trend: 'neutral' },
        { label: '支撐區間 (Support)', value: '2310 - 2320', trend: 'up' }
      ]
    }
  },
  BTCUSD: {
    name: '🪙 比特幣 (BTCUSD)',
    symbol: 'BINANCE:BTCUSDT',
    feedSymbol: 'BTC',
    sentiment: {
      source: 'Coinglass 全網合約多空比 (24h)',
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
      source: 'Coinglass 全網合約多空比 (24h)',
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

// Macro Data Calendar Mock (to be fetched by CF Worker later)
const macroCalendar = [
  { time: '週四 20:30', currency: 'USD', event: '核心 PCE 物價指數年率 (PCE Inflation)', impact: 'high', previous: '2.6%', forecast: '2.5%' },
  { time: '週四 20:30', currency: 'USD', event: '初請失業金人數 (Unemployment Claims)', impact: 'medium', previous: '238K', forecast: '240K' },
  { time: '週五 22:00', currency: 'USD', event: '密西根大學消費者信心指數終值', impact: 'medium', previous: '65.6', forecast: '66.0' },
  { time: '下週三 02:00', currency: 'USD', event: '美聯儲利率決議 (Fed Interest Rate Decision)', impact: 'high', previous: '5.50%', forecast: '5.50%' },
  { time: '下週五 20:30', currency: 'USD', event: '非農就業人口變動 (NFP) / 失業率', impact: 'high', previous: '272K / 4.0%', forecast: '185K / 4.0%' }
];

// News ticker initial list (to be fetched by CF Worker later)
const newsTickerData = [
  "🔥 即時快訊：美國 PCE 數據發佈前夕，市場情緒偏向保守",
  "⚡ 加密貨幣：比特幣在 $64,000 關卡持續震盪，以太坊現貨 ETF 審批迎來新進展",
  "📊 宏觀經濟：美國十年期國債收益率跌至 4.23%，美元指數微跌",
  "🪙 鏈上數據：某巨鯨於過去 2 小時向 Binance 轉入 1,200 枚 BTC，價值約 7,680 萬美元",
  "💎 黃金分析：地緣政治風險稍緩，黃金在 2330 美元附近尋求底部支撐"
];

// 2. Initialize App
window.addEventListener('DOMContentLoaded', () => {
  setupMarquee();
  initTradingView();
  renderSentiment();
  renderMacro();
  setupEventListeners();
  registerServiceWorker();
});

// 3. Setup Marquee News Ticker
function setupMarquee() {
  const marqueeContent = document.getElementById('marquee-content');
  if (!marqueeContent) return;
  
  // Combine news with padding & duplicate it for infinite loop effect
  const combinedNews = newsTickerData.join('    |    ');
  // Duplicate news to ensure seamless wrap-around animation
  marqueeContent.innerHTML = `<span class="px-4">${combinedNews}</span><span class="px-4">${combinedNews}</span>`;
}

// 4. Initialize/Update TradingView Widget
function initTradingView() {
  const config = assetConfig[state.activeAsset];
  const containerId = 'tradingview_chart';
  
  // Re-create the TV DOM container to fully destroy previous instance
  const wrapper = document.getElementById('tradingview_chart_wrapper');
  if (!wrapper) return;
  
  wrapper.style.opacity = '0';
  
  setTimeout(() => {
    wrapper.innerHTML = `<div id="${containerId}" class="w-full h-full"></div>`;
    
    if (window.TradingView) {
      state.tvWidget = new TradingView.widget({
        "autosize": true,
        "symbol": config.symbol,
        "interval": "60",
        "timezone": "Asia/Taipei",
        "theme": "dark",
        "style": "1",
        "locale": "zh_TW",
        "enable_publishing": false,
        "hide_side_toolbar": false, // show drawing tools
        "allow_symbol_change": false, // Lock it to our selector
        "calendar": true,
        "save_image": false,
        "container_id": containerId,
        "studies": [
          "RSI@tv-basicstudies",
          "MASimple@tv-basicstudies"
        ],
        "disabled_features": [
          "header_symbol_search" // Disable manual search to maintain our clean UI flow
        ]
      });
    }
    
    // Fade in chart smoothly once loaded
    setTimeout(() => {
      wrapper.style.opacity = '1';
    }, 150);
  }, 100);
}

// 5. Render Sentiment Tab Data
function renderSentiment() {
  const config = assetConfig[state.activeAsset];
  const sentimentSection = document.getElementById('sentiment-data-container');
  if (!sentimentSection) return;
  
  // Calculate percentage widths
  const longPercent = config.sentiment.longRatio;
  const shortPercent = config.sentiment.shortRatio;
  
  let detailsHtml = '';
  config.sentiment.details.forEach(item => {
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
    <!-- Asset Indicator Title -->
    <div class="mb-4 text-center">
      <h3 class="text-lg font-semibold text-white">${config.name} 籌碼觀測</h3>
      <p class="text-xs text-slate-400 mt-1">數據來源：${config.sentiment.source}</p>
    </div>
    
    <!-- Long/Short Gauge -->
    <div class="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/80 mb-4 shadow-xl">
      <div class="flex justify-between text-sm mb-2 font-bold">
        <span class="text-neon-green">LONG 多頭 (${longPercent}%)</span>
        <span class="text-neon-red">SHORT 空頭 (${shortPercent}%)</span>
      </div>
      
      <!-- Progress Bar -->
      <div class="ratio-bar w-full">
        <div class="ratio-fill" style="width: ${longPercent}%"></div>
      </div>
      
      <div class="flex justify-between text-xs text-slate-400 mt-3">
        <span>多單優勢</span>
        <span>${longPercent > shortPercent ? '多頭佔優' : '空頭佔優'}</span>
        <span>空單優勢</span>
      </div>
    </div>
    
    <!-- Detail Cards -->
    <div class="space-y-3">
      ${detailsHtml}
    </div>
    
    <!-- Dynamic Iframe Placeholder (Fallback for Charts) -->
    <div class="mt-6 p-4 bg-slate-900/60 rounded-2xl border border-dashed border-slate-700 text-center">
      <p class="text-xs text-slate-400 mb-2">🔥 籌碼熱力圖 (Coinglass 嵌入預留區)</p>
      <div class="aspect-video w-full bg-slate-800 rounded-lg flex items-center justify-center text-xs text-slate-500">
        [${config.feedSymbol} Coinglass Liquidation Map API / Iframe Placeholder]
      </div>
    </div>
  `;
}

// 6. Render Macro Tab Data
function renderMacro() {
  const container = document.getElementById('macro-data-container');
  if (!container) return;
  
  let calendarHtml = '';
  macroCalendar.forEach(item => {
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
    
    <!-- Dollar Index Quick Info -->
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

    <!-- Calendar List -->
    <div class="space-y-3">
      ${calendarHtml}
    </div>
  `;
}

// 7. Setup Event Listeners (Assets & Navigation Tabs)
function setupEventListeners() {
  // Asset Selectors
  const assetButtons = document.querySelectorAll('.asset-btn');
  assetButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selected = e.currentTarget.dataset.asset;
      if (selected === state.activeAsset) return;
      
      // Update state
      state.activeAsset = selected;
      
      // Update asset selector buttons visual styles
      assetButtons.forEach(b => {
        b.classList.remove('text-yellow-400', 'font-bold', 'border-b-2', 'border-yellow-400');
        b.classList.add('text-slate-400');
      });
      e.currentTarget.classList.remove('text-slate-400');
      e.currentTarget.classList.add('text-yellow-400', 'font-bold', 'border-b-2', 'border-yellow-400');
      
      // Trigger updates
      initTradingView();
      renderSentiment();
    });
  });

  // Tab Selectors
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedTab = e.currentTarget.dataset.tab;
      if (selectedTab === state.activeTab) return;
      
      // Update state
      state.activeTab = selectedTab;
      
      // Update button visual states
      tabButtons.forEach(b => {
        const textSpan = b.querySelector('span:last-child');
        b.classList.remove('text-blue-400');
        b.classList.add('text-slate-400');
      });
      e.currentTarget.classList.remove('text-slate-400');
      e.currentTarget.classList.add('text-blue-400');
      
      // Toggle panes
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
      
      // Performance optimization: resize TradingView widget if switching back to charts
      if (selectedTab === 'charts' && state.tvWidget) {
        initTradingView();
      }
    });
  });
}

// 8. Register Service Worker for PWA Add-To-Home-Screen Support
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('[Service Worker] Registered successfully:', reg.scope))
      .catch((err) => console.error('[Service Worker] Registration failed:', err));
  }
}
