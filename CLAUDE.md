# elevator-tuner：給 Claude Code 的專案說明

FRC 9427 的電梯前饋與 PID 學習網站。目標是讓隊員**搞懂**前饋和 PID，最後能自己把電梯調好，不是抄數字。
完整計畫書在 Google 文件；已定案的設計決策在 `docs/decisions.md`，改架構前先讀。

## 指令

```
npm install
npm run dev        # 開發伺服器
npm test           # Vitest 單元測試（core/ 必須有測試）
npm run typecheck  # tsc
npm run build      # 輸出到 dist/，GitHub Actions 自動部署到 Pages
```

## 結構

- `src/core/`：純 TypeScript，**不可 import React 或 DOM**，Web Worker 與測試都直接用
  - `units.ts` SI ↔ Phoenix 6 轉數制；`motors.ts` 馬達常數；`feedforward.ts` kG、kV、kA、等效質量
  - `profile.ts` Motion Magic 梯形軌跡；`controller/slot0.ts` Slot0 控制公式
  - `physics/` 受控體（伏特為力的單位）與 RK4 閉迴路模擬
  - `log/` .wpilog 串流解析、寫入器、欄位對應與對齊
  - `analysis/` 步驟 0 資料檢查（之後放切段、迴歸、診斷規則）
  - `codegen/` Java 範本與 JSON 設定檔（**唯一做單位換算輸出的地方**）
- `src/schema/`：zod。`ParameterSet` 是全站唯一的參數格式
- `src/workers/`：`log.worker.ts`、`sim.worker.ts`，資料用 Transferable Float64Array 傳
- `src/pages/`：`home/`、`calculate/`（1F，含教學關卡 `lessons.tsx`）、`tuning/`（2F）、`simulate/`（3F）、`learn/`（4F）
- `src/components/`：Chart（uPlot）、NumberField、Quiz、ParamCard；`src/app/`：store、Shell（井道導覽）、更新提示
- `robot-example/`：機器人端 Java 範例（AdvantageKit + Phoenix 6，隊上 IO 架構）
- `prototype/v0.1.html`：舊的單檔原型，只當參考

## 規則

- 內部一律 SI（m、m/s、kg、V）。座標是**鼓輪線位移**；`controlTop` 只影響位置換算，不影響轉數制增益
- 前饋公式：`kG = (m_G·g − F_cb)·r/G · R/(n·kT)`、`kV = G/(r·Kv)`、`kA = m_A·r·R/(G·n·kT)`；`m_G = Σmᵢkᵢ`、`m_A = Σmᵢkᵢ²`
- 控制器照 Phoenix 6：前饋用**參考**速度與加速度，只有 P、D 用誤差；kS 正負號跟 v_ref
- kS、kI 預設 0；參數缺值時要警告並用安全預設，**不可默默讀成 0**
- 網站不連線機器人、不寫馬達參數，急停一律用 Driver Station
- 介面文字用繁體中文，語氣直接，對象是高中生隊員
- 顏色只用 `src/app/theme.css` 的 CSS 變數，深淺色都要能看
- 不用 SharedArrayBuffer（GitHub Pages 無法設 COOP/COEP）
- 用瀏覽器測試建置結果時，Service Worker 會快取舊版：換新的瀏覽器設定檔或清掉 SW
- 改了 codegen 範本要執行 `UPDATE_ROBOT_EXAMPLE=1 npm test` 重新產生 `robot-example/` 的參數檔
