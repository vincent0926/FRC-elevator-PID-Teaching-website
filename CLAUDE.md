# elevator-tuner：給 Claude Code 的專案說明

FRC 9427 的電梯與單關節手臂前饋與 PID 學習網站（進站先選機構）。目標是讓隊員**搞懂**前饋和 PID，最後能自己把電梯調好，不是抄數字。
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
  - `profile.ts` Motion Magic 梯形軌跡；`controller/slot0.ts` Slot0 控制公式（含積分防飽和教學選項）
  - `physics/` 受控體（控制輸入 u 以電壓 [V] 表示，不是「電壓是力」）與 RK4 閉迴路模擬、達標標準 `spec.ts`、穩健性測試 `robustness.ts`、模型校正 `calibrate.ts`
  - `arm/` 手臂前饋 `feedforward.ts`（kG·cos θ、轉動慣量）、受控體 `plant.ts`（共用 physics 的 simulate，`gravityCosine`）、範例日誌 `sampleLog.ts`（ArmIO 欄位）
  - `deepLink.ts` 課程網站的深層連結（`?track=&scenario=&section=&from=course&ch=`），情境與 4F 單元 id 改了要通知課程那邊
  - `challenge.ts` 3F 挑戰模式出題與判斷；`twoPoint.ts` 兩點法量 kS、kG；`ratioSweep.ts` 1F 齒比掃描；`shareLink.ts` 分享機構資料的網址編碼；`paramDiff.ts` 參數組逐項比較
  - `log/` .wpilog 串流解析、寫入器、欄位對應與對齊
  - `analysis/` 步驟 0 資料檢查 `checks.ts`、切段 `segment.ts`、迴歸 `regression.ts`、診斷規則 `diagnose.ts`（決策 21–29）、SysId 比較 `sysid.ts`
  - `codegen/` Java 範本與 JSON 設定檔（**唯一做單位換算輸出的地方**；手臂在 `arm.ts`，GravityType = Arm_Cosine）、`zip.ts` 不壓縮的 ZIP 寫入器
- `src/schema/`：zod。`ParameterSet` 是電梯的參數格式，`armParameterSet.ts` 是手臂的（角度 rad，0 = 水平）
- `src/workers/`：`log.worker.ts`、`sim.worker.ts`，資料用 Transferable Float64Array 傳
- `src/pages/`：`home/`、`calculate/`（1F，含教學關卡 `lessons.tsx`、齒比掃描與分享 `RatioSweep.tsx`、完整子系統下載 `subsystemExport.ts`：用 `?raw` 直接打包 robot-example，改範例常數名稱要一起改）、`tuning/`（2F）、`simulate/`（3F，受控體開關 `plantKnobs.ts`、教學情境 `simScenarios.ts`、側視圖 `ElevatorView.tsx`、達標標準 `SpecEditor.tsx`、積分防飽和 `AntiWindupEditor.tsx`、照順序調 `TuningGuide.tsx`／`tuningSteps.ts`、挑戰、校正、穩健性測試各一個 Panel）、`arm/`（手臂線：`armStore.tsx` 狀態、`ArmCalcPage`／`armLessons.tsx` 1F、輸出 `ArmExportPanel`／`armSubsystemExport.ts`（打包 robot-example 的 arm/）、`ArmTuningPage`／`ArmDiagnosisPanel`／`armLogScenarios.ts`／`armTuning.ts` 2F（`diagnose` 用 `mechanism: 'arm'`）、`ArmSimPage`／`armSim.ts`／`armScenarios.ts`／`ArmView.tsx` 3F、`ArmLearnPage`／`ArmUnit4`／`armAssessment.ts` 4F）、`learn/`（4F，單元一 `Unit1.tsx`、單元二 `Unit2.tsx`、單元三常見的坑 `Unit3.tsx`、單元四期末檢核 `Unit4.tsx`／`assessment.ts`、兩點法 `MeasureKsKg.tsx`、SysId 比較；程式片段 `snippets.ts` 摘自 robot-example，改範例要一起改）
- `src/components/`：Chart（uPlot）、NumberField、Quiz、Exercise（填空練習）、ParamCard、ParamLibrary（參數庫，IndexedDB `src/storage/db.ts`）、Workflow（理論 → 鑑別 → 調參 → 驗證流程）；`src/app/`：store（含 `track`：電梯或手臂，存在 sessionStorage）、`Chooser.tsx` 進站選機構、Shell（井道導覽、換機構）、更新提示
- `robot-example/`：機器人端 Java 範例（AdvantageKit + Phoenix 6，隊上 IO 架構）
- `prototype/v0.1.html`：舊的單檔原型，只當參考

## 規則

- 內部一律 SI（m、m/s、kg、V；手臂角度 rad，0 = 水平、往上為正，畫面顯示度）。座標是**鼓輪線位移**；`controlTop` 只影響位置換算，不影響轉數制增益
- 前饋公式：`kG = (m_G·g − F_cb)·r/G · R/(n·kT)`、`kV = G/(r·Kv)`、`kA = m_A·r·R/(G·n·kT)`；`m_G = Σmᵢkᵢ`、`m_A = Σmᵢkᵢ²`
- 控制器照 Phoenix 6：前饋用**參考**速度與加速度，只有 P、D 用誤差；kS 正負號跟 v_ref
- kS、kI 預設 0（kS 可以在 1F 填量到的值）；參數缺值時要警告並用安全預設，**不可默默讀成 0**
- 最高速度、加速度要扣 kS；沒量 kS 時要標明是不含摩擦的理論上限
- 達標標準是教學用的，不可寫成 FRC 標準；模擬結果、診斷正確率要標明是模擬／合成資料
- 版本只以 package.json 為準，README「目前進度」要一起改（`test/version.test.ts` 會檢查）
- 網站不連線機器人、不寫馬達參數，急停一律用 Driver Station
- 介面文字用繁體中文，語氣直接，對象是高中生隊員
- 顏色只用 `src/app/theme.css` 的 CSS 變數，深淺色都要能看
- 不用 SharedArrayBuffer（GitHub Pages 無法設 COOP/COEP）
- 用瀏覽器測試建置結果時，Service Worker 會快取舊版：換新的瀏覽器設定檔或清掉 SW
- 改了 codegen 範本要執行 `UPDATE_ROBOT_EXAMPLE=1 npm test` 重新產生 `robot-example/` 的參數檔
