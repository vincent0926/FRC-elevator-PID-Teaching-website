# FRC 電梯 PID 與前饋參數學習網站

FRC 9427 的電梯調參教學工具。目標是讓隊員搞懂電梯的前饋和 PID，最後能自己把電梯調好，而不是只會抄數字。

## 網址

**https://vincent0926.github.io/FRC-elevator-PID-Teaching-website/**

推到 `main` 後 GitHub Actions 會自動測試、建置並部署，約 1–2 分鐘後網址就是最新版本（網頁上方會出現「有新版本」提示）。

> 第一次部署前要到 repo 的 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**，
> 否則部署步驟會失敗、網址會是 404。

## 目前進度：v0.3（Phase 0 + Phase 1）

| 樓層 | 功能 | 狀態 |
|---|---|---|
| 1F 計算參數 | 機構資料 → kS、kG、kV、kA、kP、Motion Magic；五個教學關卡（每關有學習目標與檢核題）；輸出 Java、JSON 設定檔、參數組；匯入預設檔 | ✅ |
| 2F 調參建議 | 匯入 .wpilog（Web Worker 串流解析）、欄位對應、步驟 0 資料檢查、日誌圖表；練習用範例日誌（五種故意設錯的情境） | ✅ 步驟 0<br>⏳ 步驟 1–3（找問題、建議、驗證）在 Phase 2 |
| 3F 模擬 | 理論值／自訂（調參建議值在 Phase 2）共用一頁、疊圖比較；理想模型／真實模型（摩擦、電流限制、電池壓降）；TalonFX 1 kHz／roboRIO 50 Hz；達標指標 | ✅ |
| 4F 實機資料教學 | 單元零（必修，勾完才開放後面）、單元一 AdvantageKit 日誌、單元二 SysId（選用） | ✅ |
| 機器人端範例 | `robot-example/`：IO 介面、TalonFX 實作、安全保護、JSON 讀取（缺欄位警告，不讀成 0） | ✅ |
| 離線 | PWA，第一次開啟後沒網路也能用；version.json 版本提示 | ✅ |

還沒做：ElevatorSim 參考 CSV 比對（Phase 0 完成標準）、Phase 2 診斷規則、Phase 3 真實模型校正與教學情境。

## 開發

```
npm install
npm run dev     # http://localhost:5173
npm test        # 單元測試（core/ 全部有測試）
npm run build
```

需要 Node.js 20 以上。

## 文件

- `CLAUDE.md`：專案結構與開發規則
- `docs/decisions.md`：已定案的設計決策
- `robot-example/`：機器人端範例程式（AdvantageKit + Phoenix 6），說明見裡面的 README
- `prototype/v0.1.html`：最早的單檔原型
