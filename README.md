# FRC 電梯 PID 與前饋參數學習網站

FRC 9427 的電梯調參教學工具。目標是讓隊員搞懂電梯的前饋和 PID，最後能自己把電梯調好，而不是只會抄數字。

## 目前狀態：v0.2（Phase 0 + Phase 1 進行中）

改用 Vite + React + TypeScript 重寫，物理、公式、日誌解析放在 `src/core/`，全部有單元測試。
舊的單檔原型保留在 `prototype/v0.1.html`。

## 開發

```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

需要 Node.js 20 以上。

## 部署到 GitHub Pages

推到 `main` 後，GitHub Actions 會跑測試、建置並部署。
**第一次要到 Settings → Pages → Build and deployment → Source 改成「GitHub Actions」**，否則 Pages 會直接拿原始碼根目錄的 `index.html`，只會看到空白頁。

## 文件

- `CLAUDE.md`：專案結構與開發規則
- `docs/decisions.md`：已定案的設計決策
- `robot-example/`：機器人端範例程式（AdvantageKit + Phoenix 6）
