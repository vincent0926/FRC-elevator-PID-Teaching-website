/**
 * 使用統計與反饋連結（決策 159、160）：純函式，不碰 DOM，送出和畫面在 `app/telemetry.ts`。
 *
 * 使用統計用 GoatCounter（不用 cookie、不存個人資料），只記「虛擬路徑」：
 * 機構／樓層（例如 `/elevator/sim`）和幾個主要動作（例如 `elevator/2f-read-file`）。
 * 不記使用者填的數字、檔名、日誌內容。
 */

export interface TelemetryConfig {
  /** GoatCounter 站台代號（`<代號>.goatcounter.com`）；空字串 = 不統計 */
  goatcounter: string
  /** 只在這個網域統計（本機開發、預覽、測試都不算） */
  host: string
  /** Google 表單網址（`.../viewform`）；空字串 = 改用 GitHub Issue */
  formUrl: string
  /** 表單裡「網站資訊」那一題的 entry 編號（例如 `entry.123456`），會自動帶入版本、機構、樓層、語言 */
  formInfoEntry: string
  /** 沒設表單時用的 GitHub 專案（owner/repo） */
  repo: string
}

export interface CountEnv {
  hostname: string
  /** 自動化瀏覽器（Playwright、影片擷取）不算 */
  webdriver: boolean
  /** 使用者在網站上關掉統計 */
  optedOut: boolean
  /** 瀏覽器送出 Do Not Track 或 Global Privacy Control */
  doNotTrack: boolean
}

/** 這次要不要送統計 */
export function shouldCount(cfg: TelemetryConfig, env: CountEnv): boolean {
  return cfg.goatcounter !== '' && env.hostname === cfg.host && !env.webdriver && !env.optedOut && !env.doNotTrack
}

/** 統計功能有沒有設定好（沒設好就不顯示統計開關） */
export function countingConfigured(cfg: TelemetryConfig): boolean {
  return cfg.goatcounter !== ''
}

/** 路徑只留英數、`-`、`/`，避免把使用者輸入的東西帶出去 */
export function cleanPath(path: string): string {
  const p = path
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^[-/]+|[-/]+$/g, '')
  return p.slice(0, 80)
}

export interface CountHit {
  /** 路徑（瀏覽：`elevator/sim`；動作：`elevator/2f-read-file`） */
  path: string
  /** true = 動作（GoatCounter 的 event），false = 瀏覽頁面 */
  event: boolean
  /** 畫面大小，例如 1600×900，GoatCounter 用來分手機／電腦 */
  screen?: { width: number; height: number; dpr: number }
  /** 防快取用的亂數 */
  rnd: string
}

/** GoatCounter 的計數網址（GET /count，跟官方 count.js 送的一樣，只是不用載入外部程式） */
export function countUrl(site: string, hit: CountHit): string {
  const q = new URLSearchParams()
  const p = cleanPath(hit.path)
  q.set('p', hit.event ? p : '/' + p)
  if (hit.event) q.set('e', 'true')
  if (hit.screen) q.set('s', `${Math.round(hit.screen.width)},${Math.round(hit.screen.height)},${hit.screen.dpr}`)
  q.set('rnd', hit.rnd)
  return `https://${site}.goatcounter.com/count?${q}`
}

export interface FeedbackContext {
  version: string
  track: string | null
  page: string
  lang: 'zh' | 'en'
}

/** 反饋自動帶入的網站資訊（不含使用者資料） */
export function feedbackInfo(c: FeedbackContext): string {
  return `v${c.version} · ${c.track ?? 'chooser'} · ${c.page} · ${c.lang}`
}

/** 「回報問題／給建議」的連結：有 Google 表單用表單（不用帳號），沒有就開 GitHub Issue */
export function feedbackUrl(cfg: TelemetryConfig, c: FeedbackContext): string {
  const info = feedbackInfo(c)
  if (cfg.formUrl) {
    const u = new URL(cfg.formUrl)
    if (cfg.formInfoEntry) {
      u.searchParams.set('usp', 'pp_url')
      u.searchParams.set(cfg.formInfoEntry, info)
    }
    return u.toString()
  }
  const zh = c.lang === 'zh'
  const title = zh ? '[反饋] ' : '[Feedback] '
  const body = zh
    ? `## 發生什麼事／想要什麼\n\n\n\n## 怎麼重現（選填）\n\n\n\n---\n網站資訊：${info}`
    : `## What happened / what would you like\n\n\n\n## Steps to reproduce (optional)\n\n\n\n---\nSite info: ${info}`
  const q = new URLSearchParams({ title, body })
  return `https://github.com/${cfg.repo}/issues/new?${q}`
}
