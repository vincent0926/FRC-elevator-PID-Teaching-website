# FRC 電梯 PID 與前饋參數學習網站

FRC 9427 的電梯調參教學工具。目標是讓隊員搞懂電梯的前饋和 PID，最後能自己把電梯調好，而不是只會抄數字。

## 目前狀態

v0.1 原型，單一 HTML 檔，直接用瀏覽器打開 `index.html` 就能用。

- 計算參數：輸入機構資料，即時算出 kG、kV、kA、kP（含 Phoenix 6 轉數制換算與串級式等效質量加權）
- 模擬：理想模型 + Slot0 控制公式 + Motion Magic 梯形軌跡，可用滑桿調整 kG、kP、kD
- 調參建議：範例資料與引導模式示範（日誌匯入尚未實作）
- 實機資料教學：單元零檢查清單，完成後解鎖後續單元

## 接下來

依計畫書分期，改用 Vite + React + TypeScript 重構，物理、公式、日誌解析放在 `src/core/`，並補上單元測試。

## 開啟 GitHub Pages

Settings → Pages → Source 選 `main` 分支、根目錄，存檔後即可用網址瀏覽。
https://claude.ai/artifact/VFL7tWEVfhgyhZcQUm1ESU
