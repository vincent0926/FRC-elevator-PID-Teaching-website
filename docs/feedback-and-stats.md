# 後台：反饋與使用統計

網站是純前端（決策 8），沒有自己的伺服器，所以「後台」用兩個免費服務代替：

| 要看什麼 | 去哪裡看 | 還沒設定時 |
|---|---|---|
| 隊員的反饋 | Google 表單連到的試算表 | 「回報問題／給建議」改開 GitHub Issue（要 GitHub 帳號） |
| 使用量（哪個機構、哪一層、主要動作） | GoatCounter 儀表板 | 不統計，頁尾也不顯示統計開關 |

設定都在 `src/app/telemetry.ts` 最上面的 `TELEMETRY`，改完照平常流程合併上線就生效。

## 1. 反饋：Google 表單（約 5 分鐘）

1. 到 [Google 表單](https://forms.google.com) 開新表單，標題例如「FRC 9427 調參網站反饋」。
2. 建議的題目：
   - **類型**（單選，必填）：有地方算錯／壞掉、看不懂、想要新功能、其他
   - **想說的話**（段落，必填）
   - **怎麼重現**（段落，選填）：在哪一頁、按了什麼
   - **聯絡方式**（簡答，選填）：寫「想要回覆的話留 Discord 或班級座號」，不要要求真實姓名
   - **網站資訊**（簡答，選填）：網站會自動帶入，說明寫「自動帶入，不用改」
3. 右上角「⋮」→「取得預先填入的連結」，在「網站資訊」填 `test`，按「取得連結」並複製。
   連結長這樣：`https://docs.google.com/forms/d/e/1FAIpQL.../viewform?usp=pp_url&entry.123456789=test`
4. 把它拆成兩個值填進 `TELEMETRY`：
   - `formUrl`：`?` 前面那段（`https://docs.google.com/forms/d/e/1FAIpQL.../viewform`）
   - `formInfoEntry`：`entry.` 加數字（`entry.123456789`）
5. 表單「回覆」分頁 →「連結至試算表」。之後所有反饋都在那張試算表，可以分享給其他幹部。

表單設定建議：不要勾「收集電子郵件地址」，也不要限制「只有登入的使用者」，不然沒有 Google 帳號的隊員填不了。

## 2. 使用統計：GoatCounter（約 3 分鐘）

1. 到 [goatcounter.com](https://www.goatcounter.com/signup) 註冊，「Code」填例如 `frc9427-tuner`（之後的儀表板網址是 `https://frc9427-tuner.goatcounter.com`）。
2. 把代號填進 `TELEMETRY.goatcounter`，例如 `goatcounter: 'frc9427-tuner'`。
3. 上線後打開網站點幾下，幾分鐘內儀表板就看得到。

想讓其他隊員也看得到儀表板：GoatCounter 的 Settings 裡可以把儀表板設成公開（只能看、不能改），就不用分享帳號密碼。

### 儀表板上看得到什麼

網站送的都是「路徑」，不是真的網址：

| 路徑 | 意思 |
|---|---|
| `/splash`、`/chooser` | 進站畫面、選機構畫面 |
| `/elevator/home`、`/elevator/calc`、`/elevator/tune`、`/elevator/sim`、`/elevator/learn`、`/elevator/guide`、`/elevator/lessons` | 電梯的總覽、1F、2F、3F、4F、使用說明、教學關卡 |
| `/arm/...` | 手臂，同上 |
| `/flywheel/calc`、`/flywheel/sim`、`/flywheel/lessons` | 射球飛輪的 1F、3F、教學關卡 |

動作（儀表板上標成 event）：

| 動作 | 意思 |
|---|---|
| `lang/zh`、`lang/en` | 用中文還是英文（每個分頁算一次） |
| `chooser/flywheel-ballistic`、`chooser/flywheel-custom`、`chooser/flywheel-move` | 射球飛輪選了彈道、客製化、邊移動邊射 |
| `elevator/2f-read-sample`、`elevator/2f-read-file`（手臂是 `arm/...`） | 2F 讀了範例日誌、讀了自己的 .wpilog |
| `elevator/lesson-<id>` 等 | 第一次完成某個教學關卡 |
| `<機構>/feedback-open` | 點了「回報問題／給建議」 |

「看機構使用量」就比 `/elevator/...`、`/arm/...`、`/flywheel/...` 的訪客數；「大家卡在哪」可以比 1F 和 3F、3F 和 2F 的人數差多少。

## 不會收集的東西

- 使用者填的數字、上傳的檔案、日誌內容、檔名
- 姓名、帳號、cookie
- 本機開發（`npm run dev`、`vite preview`）、自動化瀏覽器（Playwright、影片擷取）不會送
- 使用者在頁尾關掉統計，或瀏覽器送出「不要追蹤」（Do Not Track／Global Privacy Control）就不送

使用者多數是未成年的隊員，新增要記的動作前先想：這個資料真的會用來改網站嗎？只記路徑，不記內容。
