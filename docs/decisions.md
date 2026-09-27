# 已定案的設計決策

改動任何一條前，先在隊上討論並更新這份文件。

| # | 決策 | 理由 |
|---|---|---|
| 1 | 刪除即時監測模式，改用日誌匯入 | 避開網頁控制馬達的安全風險與 NT4 技術風險 |
| 2 | SysId 改為選用 | 電梯行程短，動態測試易撞限位；理論值加簡易電壓測試即可起步 |
| 3 | 摩擦不對稱用 Slot 切換（往上 Slot 0、往下 Slot 1），不用 roboRIO 額外前饋 | 全程由 TalonFX 1 kHz 執行，不需 kI |
| 4 | 等效質量依速度比加權：重力 Σmᵢkᵢ、慣性 Σmᵢkᵢ² | 串級式直接相加會讓 kG、kA 都算錯 |
| 5 | 資料結構以「機構類型」抽象（`mechanism.kind`） | 2027 年機器人不一定有電梯；預留手臂、飛輪 |
| 6 | 模擬三個入口（理論值、調參建議值、自訂）共用一頁 | 只差在參數來源，方便疊圖比較 |
| 7 | 程式碼為參數最終依據 | 網頁改的參數開機後會被 configureMotor() 覆蓋 |
| 8 | 純前端 PWA，部署在 GitHub Pages | 比賽場地通常沒網路；不需要伺服器 |
| 9 | 不用 SharedArrayBuffer，Worker 之間用 Transferable Float64Array | SharedArrayBuffer 需要 COOP/COEP 標頭，GitHub Pages 無法設定 |
| 10 | 內部一律 SI，只在 `core/codegen/` 換成 Phoenix 6 轉數制 | 單位錯誤是最常見的 bug，集中在一個地方比較好查 |

## v0.2 實作時新增的決策

| # | 決策 | 理由 |
|---|---|---|
| 11 | 受控體以「伏特」為力的單位：`kA·a = u − kV·v − kG − kS·sgn(v)` | 反電動勢剛好等於 kV·v，每顆馬達電流 = (u − kV·v)/R，電流限制、電池壓降都能在同一套單位內處理；也讓「理論值」與「模擬受控體」直接對應 |
| 12 | 參數座標固定為鼓輪線位移；`controlTop` 只改位置換算 | 鼓輪轉一圈就是機構一圈，轉數制增益與座標選擇無關，避免重複換算 |
| 13 | 日誌分兩階段讀：先掃欄位（不存值），再只取對應到的欄位 | 20 分鐘、上百欄位的日誌若全部存成陣列會吃掉數百 MB |
| 14 | 欄位對齊用零階保持，不用內插 | AdvantageKit 只在數值改變時寫入，內插會產生不存在的值 |
| 15 | 物理積分固定 1 ms RK4；控制器依位置 1 ms / 20 ms 更新並零階保持 | 同一個受控體可以直接比較 TalonFX 與 roboRIO 執行閉迴路的差別 |

## v0.3 實作時新增的決策

| # | 決策 | 理由 |
|---|---|---|
| 16 | 練習用範例日誌由模擬器產生，情境（kG 少、kV 多、沒設 kS、太快飽和）集中在 `pages/tuning/sampleScenarios.ts` | 沒機器人也能練習讀圖；Phase 2 驗證診斷正確率時用同一批情境 |
| 17 | Java 範本一律輸出 `slot1()`，沒有摩擦不對稱時回傳 `null` | 機器人端讀取器可以固定呼叫，不必依版本判斷；JSON 缺 Slot 1 欄位時沿用 Slot 0，不讀成 0 |
| 18 | `robot-example/` 的 ElevatorGains.java 與 JSON 由範本產生，單元測試檢查一致 | 範例程式與網站輸出不會各自走樣 |
| 19 | 回授輸出記錄 P+I+D 三項相加，前饋 = 閉迴路總輸出 − 回授 | 不依賴 Phoenix 6 各版本對 ClosedLoopFeedForward 定義的差異 |
| 20 | GitHub Pages 用 gh-pages 分支部署（peaceiris/actions-gh-pages），不用 actions/deploy-pages | deploy-pages 需要先手動到 Settings 開啟 Pages；推 gh-pages 分支會自動開啟，換人維護也不會卡在設定 |
