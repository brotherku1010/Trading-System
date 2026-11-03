export const FACTORS = [
  { id: 'DXY', name: '美元指數', symbol: 'DXY', unit: '指數點', weight: -3, group: '美元', note: '美元走強通常提高非美元買家的黃金成本；避險時可同漲。' },
  { id: 'SILVER', name: '白銀', symbol: 'XAG/USD', unit: 'USD / 金衡盎司', weight: 2, group: '貴金屬', note: '常見同向，但工業需求與金銀比可能造成分歧。' },
  { id: 'WTI', name: 'WTI 原油', symbol: 'WTI/USD', unit: 'USD / 桶', weight: 0.5, group: '商品', note: '油價影響通膨與成長；對黃金沒有固定方向。' },
  { id: 'US10Y', name: '美債 10 年殖利率', symbol: 'DGS10', unit: '%', weight: -2, group: '利率', kind: 'yield', note: '殖利率不是債券價格；名目殖利率上升不必然代表實質利率上升。' },
  { id: 'REAL10Y', name: '10 年實質殖利率', symbol: 'DFII10', unit: '%', weight: -3, group: '利率', kind: 'yield', note: '持有無息黃金的機會成本；通常比名目利率更有解釋力。' },
  { id: 'BOND', name: '長天期美債價格', symbol: 'TLT', unit: 'USD / ETF 股', weight: 1, group: '利率', proxy: true, note: '以 TLT ETF 代理，非美債期貨。與殖利率通常反向，勿重複計權。' },
  { id: 'BTC', name: '比特幣', symbol: 'BTCUSDT', unit: 'USDT / BTC', weight: 0.3, group: '風險資產', note: '與黃金的關係不穩定，不視為固定避險訊號。' },
  { id: 'ETH', name: '以太幣', symbol: 'ETHUSDT', unit: 'USDT / ETH', weight: 0.2, group: '風險資產', note: '多受加密市場資金與風險偏好影響。' },
  { id: 'SPX', name: 'S&P 500', symbol: 'SPX', unit: '指數點', weight: -0.5, group: '股指', note: '風險偏好代理；去槓桿時可能與黃金同跌。' },
  { id: 'NDX', name: 'Nasdaq 100', symbol: 'NDX', unit: '指數點', weight: -0.4, group: '股指', note: '科技股與利率敏感度較高，非獨立黃金驅動因子。' },
  { id: 'DJI', name: '道瓊工業指數', symbol: 'DJI', unit: '指數點', weight: -0.3, group: '股指', note: '股票風險偏好代理。' },
  { id: 'NIKKEI', name: '日經 225', symbol: 'N225', unit: '指數點', weight: -0.2, group: '股指', note: '日股與日圓政策影響，對黃金關係不穩定。' },
  { id: 'EUROSTOXX', name: 'Euro Stoxx 50', symbol: 'STOXX50E', unit: '指數點', weight: -0.2, group: '股指', note: '歐洲風險資產代理，非固定反向關係。' },
  { id: 'USDJPY', name: '美元／日圓', symbol: 'USD/JPY', unit: 'JPY / USD', weight: -1, group: '美元', note: '上漲是日圓轉弱；日銀政策可能讓關係反轉。' },
  { id: 'EURUSD', name: '歐元／美元', symbol: 'EUR/USD', unit: 'USD / EUR', weight: 1, group: '美元', note: '美元的另一種觀察角度，勿與美指當作獨立證據。' },
  { id: 'GBPUSD', name: '英鎊／美元', symbol: 'GBP/USD', unit: 'USD / GBP', weight: 0.7, group: '美元', note: '英國政策可造成獨立行情。' }
];

export const GOLD = { id: 'GOLD', name: '黃金現貨', symbol: 'XAU/USD', unit: 'USD / 金衡盎司' };
export const ASSETS = [GOLD, ...FACTORS];
export const REGIMES = {
  normal: { name: '一般市場', note: '美元與持有成本主導；其他因子的關係較弱。', bias: 0 },
  haven: { name: '避險升溫', note: '美元與黃金可同漲；避險需求可能蓋過美元壓力。', bias: 3 },
  inflation: { name: '通膨／停滯風險', note: '油價下跌不保證金價上漲；需分辨需求衰退與通膨預期。', bias: 1 },
  liquidity: { name: '流動性緊縮', note: '保證金與現金需求可能使股票、原油與黃金同跌。', bias: -3 },
  hawkish: { name: '鷹派利率衝擊', note: '實質殖利率與美元走高時，黃金機會成本壓力加大。', bias: -1 },
  centralbank: { name: '央行／實體需求', note: '官方買盤可能支撐黃金，削弱美元與利率的傳統關係。', bias: 2 }
};

export const MACRO = [
  { id: 'CPI', name: 'CPI / 核心 CPI', unit: '%', sign: -1, time: '08:30', period: '數分鐘至 1–3 個交易日', above: '通膨高於預期，若升息定價與實質殖利率上升，通常壓抑黃金。', caveat: '停滯性通膨／避險買盤可能抵銷；不能只看通膨單一數字。', source: 'https://www.bls.gov/schedule/news_release/cpi.htm' },
  { id: 'PCE', name: '核心 PCE', unit: '%', sign: -1, time: '08:30', period: '數分鐘至數個交易日', above: '高於預期通常推升緊縮預期，對黃金偏壓力。', caveat: '比較月增、年增與修正值，避免只看標題。', source: 'https://www.bea.gov/news/schedule' },
  { id: 'NFP', name: '非農就業人口', unit: '千人', sign: -1, time: '08:30', period: '數分鐘至 1–3 個交易日', above: '就業高於預期通常支撐美元與利率，對黃金偏壓力。', caveat: '薪資、失業率與前值修正可能使初始反應逆轉。', source: 'https://www.bls.gov/schedule/news_release/empsit.htm' },
  { id: 'UNEMP', name: '失業率', unit: '%', sign: 1, time: '08:30', period: '數分鐘至數個交易日', above: '失業率高於預期通常增加降息定價，對黃金偏支持。', caveat: '勞參率與就業人數須一起看；流動性危機時仍可能賣金。', source: 'https://www.bls.gov/schedule/news_release/empsit.htm' },
  { id: 'CLAIMS', name: '初領失業救濟金', unit: '千人', sign: 1, time: '08:30', period: '數分鐘至當日', above: '申請人數高於預期通常偏向經濟轉弱與降息敘事。', caveat: '單週雜訊較大，應看四週均值。', source: 'https://www.dol.gov/ui/data.pdf' },
  { id: 'GDP', name: 'GDP', unit: '%', sign: -1, time: '08:30', period: '當日至數個交易日', above: '成長高於預期通常支撐美元與利率。', caveat: '需分辨庫存、消費與物價分項，以及初值或修正值。', source: 'https://www.bea.gov/news/schedule' },
  { id: 'RETAIL', name: '零售銷售', unit: '%', sign: -1, time: '08:30', period: '數分鐘至當日', above: '消費強於預期通常削弱降息預期。', caveat: '控制組與前值修正可改變解讀。', source: 'https://www.census.gov/economic-indicators/' },
  { id: 'PMI', name: 'ISM PMI', unit: '指數點', sign: -1, time: '10:00', period: '當日至數個交易日', above: '景氣強於預期通常支撐美元；黃金偏承壓。', caveat: '價格支付與就業分項可能互相衝突。', source: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/' },
  { id: 'FOMC', name: 'FOMC 利率決議', unit: '%', sign: -1, time: '14:00', period: '聲明後 30–90 分鐘至數週', above: '利率高於市場預期通常偏鷹派，對黃金偏壓力。', caveat: '記者會、點陣圖、縮表與未來路徑可翻轉聲明反應。', source: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' }
];
