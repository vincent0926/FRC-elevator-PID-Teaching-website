# FRC 電梯 PID 與前饋參數學習網站

FRC 9427 的電梯調參教學工具。目標是讓隊員搞懂電梯的前饋和 PID，最後能自己把電梯調好，而不是只會抄數字。

## 網址

**https://vincent0926.github.io/FRC-elevator-PID-Teaching-website/**

推到 `main` 後 GitHub Actions 會自動測試、建置，並把網站推到 `gh-pages` 分支，約 1–2 分鐘後網址就是最新版本（網頁上方會出現「有新版本」提示）。
部署進度看 repo 的 Actions 分頁。

## 目前進度：v0.5（Phase 0–2 + Phase 3 模擬步驟 5–7）

| 樓層 | 功能 | 狀態 |
|---|---|---|
| 1F 計算參數 | 機構資料 → kS、kG、kV、kA、kP、Motion Magic；五個教學關卡（每關有學習目標與檢核題）；輸出 Java、JSON 設定檔、參數組；匯入預設檔 | ✅ |
| 2F 調參建議 | 匯入 .wpilog、欄位對應、步驟 0 資料檢查；步驟 1–3：依「物理限制 → 振盪 → 機構 → kG → kS → kV → kA → kP → kD」找第一優先問題、一次改一個、模擬預覽、上機驗證、調參歷程；引導模式（自己選問題寫理由，三層提示）與專家模式；練習用範例日誌 10 種 | ✅ 診斷正確率 97%（72 份隨機模擬日誌） |
| 3F 模擬 | 理論值／調參建議值／自訂共用一頁、疊圖比較（曲線與指標並排）；理想模型／真實模型，每一項可單獨開關（電壓飽和、摩擦含往上往下不對稱、電流限制、電池壓降、齒輪箱效率、感測延遲與雜訊、連續式換級 kG 跳變）；往下用 Slot 1；TalonFX 1 kHz／roboRIO 50 Hz；11 個教學情境（按一下載入，附觀念說明）；動畫可暫停、慢動作、拖時間軸；位置、誤差、速度、電壓、電流圖 | ✅ |
| 4F 實機資料教學 | 單元零（必修，勾完才開放後面）、單元一 AdvantageKit 日誌、單元二 SysId（選用） | ✅ |
| 機器人端範例 | `robot-example/`：IO 介面、TalonFX 實作、安全保護、JSON 讀取（缺欄位警告，不讀成 0） | ✅ |
| 離線 | PWA，第一次開啟後沒網路也能用；version.json 版本提示 | ✅ |

還沒做：2F 的摩擦不對稱 Slot 切換建議與「kD 太大（放大雜訊）」診斷、模擬步驟 8（基準參數與挑戰模式）、步驟 9 模型校正、步驟 10 穩健性測試、單元二 SysId 完整教學、新隊員試用。

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

 ## 計劃書 供參考
 https://docs.google.com/document/d/1COk0hkgmx6_rWsd29wvYwGAsm021SyaoNdcIHxZr26o/edit?usp=sharing
