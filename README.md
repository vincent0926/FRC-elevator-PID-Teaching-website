# FRC 電梯 PID 與前饋參數學習網站

FRC 9427 的電梯調參教學工具。目標是讓隊員搞懂電梯的前饋和 PID，最後能自己把電梯調好，而不是只會抄數字。

## 網址

**https://vincent0926.github.io/FRC-elevator-PID-Teaching-website/**

推到 `main` 後 GitHub Actions 會自動測試、建置，並把網站推到 `gh-pages` 分支，約 1–2 分鐘後網址就是最新版本（網頁上方會出現「有新版本」提示）。
部署進度看 repo 的 Actions 分頁。

## 目前進度：v0.9（Phase 0–3 功能全部完成）

| 樓層 | 功能 | 狀態 |
|---|---|---|
| 1F 計算參數 | 機構資料 → kS、kG、kV、kA、kP、Motion Magic；五個教學關卡（每關有學習目標與檢核題）；輸出 Java、JSON 設定檔、參數組；匯入預設檔；「哪些參數可以算、哪些一定要量」對照表（參數卡上標算／算＋量／量／決定）；為什麼參數單位是伏特（控制輸入以電壓表示）與近似模型說明；教學關卡的填空練習（自己算 m_G、m_A，答錯會說錯在哪）、純 PID 對 前饋＋PID、加 kI 的比較；**齒比怎麼選**（只換齒比，看跑完全程的時間與停在半空的電流，參考 ReCalc）；**分享連結**（機構資料放進網址傳給隊友）；**下載完整子系統 .zip**（範例程式＋這台電梯的常數）與「為什麼 PID 放在馬達控制器」；**參數庫**（存多組參數、標理論值／模擬最佳／實機最終、逐項比較、下載） | ✅ |
| 2F 調參建議 | 匯入 .wpilog、欄位對應、步驟 0 資料檢查；步驟 1–3：依「物理限制 → 振盪 → 機構 → kG → kS → kV → kA → kP → kD」找第一優先問題、一次改一個、模擬預覽、上機驗證、調參歷程；引導模式（自己選問題寫理由，三層提示）與專家模式；練習用範例日誌 12 種（含 kD 放大雜訊、摩擦不對稱）；kD 放大雜訊時建議降 kD 而不是降 kP；摩擦不對稱時說明 kG、kS 已是最佳解、何時才需要 Slot 1 | ✅ 診斷正確率 97%（72 份隨機模擬日誌） |
| 3F 模擬 | 理論值／調參建議值／自訂共用一頁、疊圖比較（曲線與指標並排）；理想模型／真實模型，每一項可單獨開關（電壓飽和、摩擦含往上往下不對稱、電流限制、電池壓降、齒輪箱效率、感測延遲與雜訊、連續式換級 kG 跳變）；往下用 Slot 1；TalonFX 1 kHz／roboRIO 50 Hz；11 個教學情境（按一下載入，附觀念說明）；動畫可暫停、慢動作、拖時間軸；位置、誤差、速度、電壓、電流圖；基準參數（設為基準／重置為基準）；挑戰模式（隱藏機構、有限次數）；模型校正（開迴路重播、擬合重力／kV／等效質量／摩擦，「已校正模型」）；穩健性測試（隨機質量、電池、摩擦跑幾十次，看通過率與最差曲線）；馬達控制器設定（TalonFX／SPARK MAX、Stator／Supply 電流限制、軟體限位、輸出上限、Brake／Coast、SPARK MAX 電壓補償）與 3 個對應情境；「這是近似模型」標示；**電梯側視圖**（每一級的位置，看得出鼓輪線位移和最上層高度差多少）；**達標標準可調**（預設／精準放置／快就好，或自己填）；參數庫的任一組可以疊圖比較 | ✅ |
| 4F 實機資料教學 | 單元零（必修，勾完才開放後面）；單元一 AdvantageKit 日誌（欄位對應 StatusSignal、記錄頻率、LoggedTunableNumber、AdvantageScope 檢查、常見錯誤）；單元二 SysId（SysIdRoutine、SignalLogger、安全執行順序、分析、跟理論值比較並推測填錯的機構資料）；單元二補「為什麼會跟理論值不一樣」；**單元三 常見的坑**（位置座標、roboRIO 50 Hz 對 1 kHz、電壓補償與 FOC、夾遊戲物件 kG 變了，可直接到 3F 看情境）；每單元 3 題檢核 | ✅ |
| 機器人端範例 | `robot-example/`：IO 介面、TalonFX 實作、安全保護、歸零指令（homeCommand，失速偵測）、JSON 讀取（缺欄位警告，不讀成 0）、SysId 指令、LoggedTunableNumber；網站 1F 可以直接下載成 zip | ✅ |
| 離線 | PWA，第一次開啟後沒網路也能用；version.json 版本提示 | ✅ |

還沒做：英文版；找新隊員實際試用，檢查學習成效（需要真人）。

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
