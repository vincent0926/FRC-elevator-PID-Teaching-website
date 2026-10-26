# 網站介紹影片

給 FRC 程式組看的網站介紹影片，賽博風格，有兩支：

| 影片 | 大小 | 長度 | 成品 | 網址 |
|---|---|---|---|---|
| 完整版 | 1920×1080 橫式 | 約 3 分 15 秒 | `public/intro.mp4` | https://vincent0926.github.io/FRC-elevator-PID-Teaching-website/intro.mp4 |
| 精華版（社群用） | 1080×1920 直式 | 30 秒 | `public/intro-short.mp4` | https://vincent0926.github.io/FRC-elevator-PID-Teaching-website/intro-short.mp4 |

成品放在 `public/`，跟網站一起部署到 GitHub Pages；PWA 不快取 mp4，打開網站不會多下載。專案 README 的「介紹影片」連到這裡，`poster.jpg` 是那裡的封面圖。

**完整版的內容**：痛點 → 網站做什麼 → **01 去哪裡找**（網址、QR Code、手機可用、離線可用）→ **02 怎麼用**（開始、選機構、1F、3F、**3F 實際操作**、4F、2F、射球飛輪）→ **03 建議順序** → 卡住時去哪裡看 → 安全提醒 → 第一步：打開網站走進 1F → 結尾網址。

「3F 實際操作」是真的在網站上操作錄下來的：kG 設 0、kP 調小，托架停在目標下面；kG 填回理論值，托架剛好停住。用來回答開頭的「電梯停住後往下掉？」。

**設計原則**（2026-10 討論定案）：一次只放一句重點；彩色橫條的故障效果只在章節切換出現，其他換幕只有淡入淡出，避免一直閃；網站截圖會推近到要看的地方。

影片沒有旁白，只有背景音樂和換幕音效。音樂是程式合成的，**還沒有人實際聽過**，發布前請先聽一次；要錄旁白可以照下面的「旁白稿」念。

## 檔案

- `capture.cjs`：自動操作網站，擷取所有畫面到 `assets/`（含 3F 實際操作的每一格 `assets/demo/`）
- `intro.html`、`short.html`：每一幕的內容；`style.css`、`engine.js` 兩支共用（時間軸、進場效果、鏡頭推近、示範畫面播放）。時間全部由 `seek(t)` 算出來，每次輸出都一樣。用瀏覽器打開後在開發者工具執行 `seek(30)` 可以看第 30 秒
- `render.cjs`：一格一格截圖交給 ffmpeg；版本號讀 `package.json`，示範畫面的格數和理論 kG 讀 `assets/demo/meta.json`；也寫出 `timeline-<名稱>.json`
- `music.py`：用 numpy／scipy 合成背景音樂和換幕音效，讀 `timeline-<名稱>.json` 對齊換幕
- `assets/qr.svg`：網站網址的 QR Code

## 網站改版後重新做影片

```
npm run build && npx vite preview --port 4173     # 另開一個終端機
node video/capture.cjs                            # 重新擷取畫面（約 1 分鐘）
cd video
node render.cjs --stills 10,60,120                # 先截幾張圖檢查（存到 stills/）
node render.cjs                                   # 完整版無聲影片，約 17 分鐘
node render.cjs --page short.html                 # 精華版，約 3 分鐘
python3 music.py intro && python3 music.py short  # 配樂
ffmpeg -y -i out/intro-silent.mp4 -i out/intro-music.wav -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart ../public/intro.mp4
ffmpeg -y -i out/short-silent.mp4 -i out/short-music.wav -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart ../public/intro-short.mp4
```

需要 Playwright（Chromium）、ffmpeg、Python 的 numpy 和 scipy。網站的按鈕名稱、樓層代號改了，`capture.cjs` 找不到元素會直接報錯，照錯誤訊息改選擇器。

## 旁白稿（選用，完整版）

| 時間 | 畫面 | 旁白 |
|---|---|---|
| 0:00 | 開機、標題 | FRC 9427 調整參數網站，給程式組的前饋與 PID 學習網站。 |
| 0:12 | kP 填多少？往下掉？一直抖？ | kP 要填多少？電梯停住後往下掉？手臂到位後一直抖？ |
| 0:22 | 別再亂猜數字 | 別再亂猜數字了。先搞懂，再自己調好。 |
| 0:29 | 計算・模擬・診斷・教學 | 電梯、手臂、射球飛輪，這個網站幫你計算、模擬、診斷，還有教學。 |
| 0:36 | 01 網址、QR Code | 網站在 vincent0926.github.io 斜線 FRC-elevator-PID-Teaching-website，也可以直接掃 QR Code。 |
| 0:47 | 手機・平板・電腦 | 手機、平板、電腦都能用，開過一次之後，沒網路也能用。 |
| 0:53 | 02 開始、選機構 | 進站按「開始」，選你要調的機構：電梯、手臂，或射球飛輪。 |
| 1:14 | 一棟樓 | 網站像一棟樓，一層只做一件事。 |
| 1:24 | 1F | 1F 填機構資料，算出 kS、kG、kV、kA、kP 的起始值。 |
| 1:36 | 3F | 3F 拖滑桿，馬上看結果。 |
| 1:42 | 3F 實際操作 | 還記得電梯往下掉嗎？把 kG 設成 0，只靠很小的 kP，托架停不到目標。kG 填回理論值，kP 不用動，剛好停住。 |
| 2:02 | 4F | 4F 先學安全須知，再學怎麼錄日誌、跑 SysId。 |
| 2:09 | 2F | 2F 匯入 .wpilog，先檢查資料，再照順序找出第一個問題，一次只改一個參數。 |
| 2:20 | 射球飛輪 | 射球飛輪給距離、選軌跡，就得到要幾 rps 和砲台角度。 |
| 2:29 | 03 建議順序 | 建議順序：1F、3F、4F、2F，最後上機驗證。 |
| 2:43 | 卡住了 | 卡住了就點每一頁的「怎麼用這一頁？」，或到教學關卡做檢核題。 |
| 2:50 | 安全 | 網站不連線機器人、不寫馬達參數，急停一律用 Driver Station。 |
| 2:58 | 第一步 | 現在就打開網站，走進 1F，填你們電梯的資料。 |
| 3:04 | 結尾 | 搞懂前饋與 PID，自己把機構調好。 |
