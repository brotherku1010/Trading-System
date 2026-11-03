# PAW 黃金情境研究

由原有 Cloudflare Worker / PWA 改為黃金跨市場情境研究工具。不自動下單。

## 啟動

需要 Node.js 22 以上與 npm。在本專案目錄執行：

```powershell
npm install
npm run dev
```

本機預設網址：<http://127.0.0.1:8787>。修改前端後重新執行 `npm run build` 並重新整理；Worker 由 Wrangler 監看。

```powershell
npm test
npm run build
npx wrangler deploy --dry-run
```

正式部署後端使用 `npm run deploy`，需先由使用者登入自己的 Cloudflare 帳號。部署腳本會首次建立加密金鑰及管理存取碼，後續不覆寫已存在的 Secret。不會自動 commit 或 push GitHub。

## GitHub Pages 與 PWA

公開前端：<https://brotherku1010.github.io/Trading-System/>。API：<https://tradingsystem.jppsku.workers.dev>。

GitHub `Settings > Pages > Build and deployment > Source` 改為 **GitHub Actions**，由 `.github/workflows/deploy-pages.yml` 測試、打包 `public/` 並部署。不要再使用 main 根目錄直接發布，因為根目錄 `app.js` 現在是需建置的原始碼。

Workflow 可用 repository variable `PAW_API_BASE_URL` 覆寫 API origin。它只包含公開 HTTPS 網址，不可放任何 Key。產生的 `runtime-config.json` 讓 Pages 子路徑正確呼叫 Cloudflare，而不是誤呼叫 `github.io/api/`。後端 CORS 只允許同源或設定的 GitHub Pages origin，保留管理存取碼保護。

PWA 保留相對 `id`、`scope`、`start_url`，可在原網址安裝為 PAW。已安裝的舊版會透過新版 Service Worker 更新；必要時關閉 PAW 後重新開啟。不更改原有圖示，也不快取 Key 或 API 回應。

## 這次修正

- 刪除前後端 PAXG + 1650/1655 的假黃金現價與離線固定價。
- 刪除隨機 RSI、MACD、清算熱力圖、虛構傳言及未連線的 OANDA/Coinglass 固定持倉比。
- 行情統一由同源 Worker 提供，保留來源商品、單位、報價時間、日資料／過期／缺值狀態。
- PWA 不快取任何 `/api/` 或舊資料端點，避免離線資料被誤認為即時。
- 靜態部署僅包含 `public/`，不再發布專案根目錄或設定檔。

## 不需要 Key 的功能

情境切換、特殊環境、手動總經公布值比較、CSV 歷史研究、情境保存與匯出皆可直接用。

| 資料 | 來源與限制 |
| --- | --- |
| 黃金／白銀 | [Gold API](https://gold-api.com/faqs)，USD 每金衡盎司的指示性現貨；約 30 秒更新，非可成交 bid/ask。失敗顯示缺值。 |
| BTC／ETH | [Binance 公開市場資料](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md)，USDT 現貨，非 USD 或合約價格。地域限制或連線失敗不補假價。 |
| 10 年名目／實質殖利率 | FRED DGS10 / DFII10 日資料，不是即時美債價格；可能因上游封鎖或逾時而缺值。 |
| 經濟日曆 | Fair Economy / Forex Factory 第三方本週日曆。未提供實際公布值；時間依來源 ISO 時區換算。重要事件以 BLS、BEA、Fed 官方發布為準。 |
| 新聞 | Fed、ECB 官方公告與動區媒體 RSS，附實際連結、來源、發布時間。無資料就不顯示消息，不代表涵蓋全部國際新聞。 |
| 熱力圖 | 使用者選擇連線的 TradingView 嵌入元件，其授權、延遲及可用性依該服務；不是委託簿或清算地圖。 |

頁面每 60 秒輪詢公開行情。貴金屬與加密行情快取 30 秒，Twelve Data 報價 5 分鐘、歷史與 FRED 1 小時、新聞 5 分鐘、日曆 30 分鐘。使用 Cloudflare Cache API 與單 isolate 記憶體；這不是逐筆行情或零延遲承諾。非日資料超過 2 分鐘標示過期，日殖利率超過 7 日標示過期；休市不會自動宣稱為即時。

## cTrader XAUUSD

cTrader 是交易平台，具體報價取決於券商、流動性提供者、合約與 bid/ask。公開黃金現貨與你的 XAUUSD 合約不保證一致。本版的「平台參考價」只計算差異，不加偏移量、也沒有連接或授權你的交易帳戶。

要精確對齊平台，需要券商名稱、同一帳戶的商品識別及讀取報價的 OAuth 授權。後續可透過 [cTrader Open API](https://help.ctrader.com/open-api/symbol-data/) 訂閱真實 bid/ask；本版未實作此連線，不需要提供帳號密碼。

## 歷史資料

在「資料與連線」逐品項取得日資料。黃金、外匯、指數與商品歷史需 Twelve Data Key 與相應訂閱；加密歷史與 FRED 日資料無須 Key。為避免一次耗盡免費額度，不自動對全部品項發送付費要求。商品代號與交易所權限需在資料商目錄確認，不能保證預設指數／原油代號對所有方案可用。

也可匯入 UTF-8 CSV（不需要 Key）：

```csv
date,asset,close
2024-01-02,GOLD,2060.00
2024-01-02,DXY,102.20
2024-01-02,REAL10Y,1.80
```

以上僅示範欄位，不是提供的真實行情。品項 ID：`GOLD,DXY,SILVER,WTI,US10Y,REAL10Y,BOND,BTC,ETH,SPX,NDX,DJI,NIKKEI,EUROSTOXX,USDJPY,EURUSD,GBPUSD`。

CSV 必須包含 GOLD，所有資料須為相同定義的已完成日收盤。殖利率單位為百分比（例如 `4.25`），可為零／負值；其他價格必須大於零。最多 8 MB / 100,000 筆，重複品項日期與未知代號會拒絕。每次匯入整批取代現有歷史，避免無意混用不同供應商；重新整理後需再載入。不會自動讀取 Excel、Google Sheets 或券商帳戶資料，也不會把 CSV 傳給 AI。

## 統計與假設

- **情境偏向**：人為設定的相對權重，未用歷史資料擬合。美元與實質利率偏反向、白銀偏同向；弱關係因子權重小。完整權重見 `lib/catalog.js`。同組取平均以降低重複計權，但沒有解決跨組共線性。環境偏置可讓美指與金價同向；不得把結果當作機率、精準預測或因果。
- **相關係數**：同期間日收盤報酬的 Pearson r；殖利率使用基點變化。必須有相同區間的兩個端點，缺值不向前填補；至少 30 筆才顯示。
- **條件頻率**：用 t 日已實現的各品項方向找歷史交集，再看黃金 t+1 或 t+5 日的後續報酬。價格門檻 ±0.1%、殖利率 ±1 bp。5 日樣本排除重疊後續區間。少於 30 筆不顯示頻率或價位；附樣本、日期與 Wilson 95% 區間。僅依方向篩選，不含市場環境與假設強度。
- **限制**：條件頻率是樣本內的描述統計，不是未來勝率，沒有樣本外回測、滾動驗證、交易成本、時區統一或多重比較校正。Wilson 區間未校正金融序列相依，不能視為交易績效的置信保證。不同市場的「同日期」仍可能有不同收盤時點。
- **價位**：近 20 日收盤區間、均值、RSI(14)、MACD(12,26,9)由日資料計算。若有足夠條件樣本、歷史截至日期不超過 7 日且公開黃金現貨時間有效，將後續報酬 10–90 百分位機械套用現貨顯示情境區間；不是未來價格的預測區間，也不是 CFD 支撐壓力或買賣建議。
- **總經事件**：先比較實際值與共識，另看薪資、修正值、通膨預期、Fed 路徑與美元／殖利率反應。盤別及影響週期是概略研究框架，非歷史估計。

研究參考：[World Gold Council](https://www.gold.org/goldhub/research/qaurum-vs-us-real-rates-and-dollar-model)、[Fed 貨幣政策](https://www.federalreserve.gov/aboutthefed/fedexplained/monetary-policy.htm)。黃金、美元、實質利率的關係可以隨市場環境改變。

## 選配 API 與 AI

`npm run dev` 首次啟動會在被 Git 忽略的 `.dev.vars` 產生加密金鑰與管理存取碼，只針對 loopback 位址開啟本機管理。正式環境沒有此免驗證模式。請保護 `.dev.vars`，不要將它上傳或公開。

**Gemini 設定流程**：開啟公開站台的「資料與連線」，輸入管理存取碼及 Gemini Key，點「可用模型」選擇實際可用的文字模型，再「儲存」，最後「連線測試」。測試會送出小型生成要求，可能計入 Google 額度。管理存取碼可在同一台電腦的本機頁面 `http://127.0.0.1:8787/#settings` 用「複製管理存取碼」取得；頁面不顯示它，也不將它儲存在 localStorage。這個複製端點只在本機管理模式且同源時存在，公開後端回應 404。

Gemini Key 以 AES-256-GCM 加密存在 Cloudflare SQLite-backed Durable Object，沒有 TTL；關閉 PWA、清除瀏覽器快取或重新部署不會刪除伺服器中保存的 Key。伺服器只回傳有無保存、模型與時間，從不回傳完整 Key。保存的 Key 由擁有管理存取碼的人共用，並非公開訪客可任意使用。

「刪除 Key」會立即移除目前保存的加密記錄，並停用舊的 `GEMINI_API_KEY` 環境變數回退，避免刪除後重新出現。不撤銷 Google 原始 Key，也不能取消已送出的請求；基礎設施備份保留政策依 Cloudflare。管理存取碼每次開啟線上 PWA 仍需輸入，Key 本身無須重輸。修改模型時將 Key 欄留空會保留原 Key。

不要輪替或刪除 `VAULT_ENCRYPTION_KEY`，否則已保存的 Key 無法解密。部署腳本只補齊不存在的 Secrets，不會覆寫既有值；備份與輪替需另外規劃。

其他選配供應商仍使用伺服器環境變數：

```powershell
npx wrangler secret put TWELVE_DATA_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL
npx wrangler secret put ANALYSIS_TOKEN
```

也保留 `GEMINI_API_KEY` 與 `GEMINI_MODEL` 相容模式，但以介面保存的 Key 優先。模型名稱依 Google 回傳的可用模型選擇。`MARKET_SYMBOLS_JSON` 可覆寫 DXY、WTI 或股指代號。模型、Key、存取保護都存在才啟用 AI。

AI 使用 [OpenAI Responses](https://developers.openai.com/api/docs/guides/text) 或 [Gemini generateContent](https://ai.google.dev/gemini-api/docs/text-generation)。沒有自動下單或取得其他帳戶資料。OpenAI 要求 `store:false`；其他資料保留條件依供應商政策。模型看到的是伺服器黃金參考行情、情境與問題，不含 CSV、歷史機率、即時新聞或總經資料；輸出明確標示此證據範圍。

AI 端點要求 `ANALYSIS_TOKEN`、同源或明確允許的 Pages origin、12 KB 上限與單 isolate 每 IP 30 秒冷卻。Key 設定端點另設 2 KB 上限並要求管理存取碼。冷卻不是跨節點的費用防線；公開部署仍建議 Cloudflare Access / WAF rate limiting，並為 Google 設定預算／額度限制。付費行情 GET 目前為站台公開讀取，持有站台連結的人能消耗快取未命中額度。不要放入不限額 Key。

## 驗證

`npm test` 使用固定測試資料與 mock API，涵蓋方向、相關係數、後續期間、樣本不足、負殖利率、CSV、時區、失敗缺值、移除假價、新聞日期及 AI 授權。真實 Key／券商連線需另做整合驗證，測試通過不代表有可交易預測能力。
