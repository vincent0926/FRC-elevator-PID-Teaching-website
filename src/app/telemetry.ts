import { countUrl, shouldCount, type TelemetryConfig } from '../core/telemetry'
import { getLang } from '../core/lang'
import { loadSession, saveSession } from '../storage/local'
import { guard, readPersisted, usePersisted } from '../storage/usePersisted'

/**
 * 使用統計與反饋的設定和送出（決策 159、160，說明見 docs/feedback-and-stats.md）。
 * 純函式在 core/telemetry.ts；這裡只負責讀瀏覽器狀態、送出 GET。
 */

/**
 * 要改的只有這裡：
 * - goatcounter：到 goatcounter.com 註冊的站台代號，空字串 = 不統計
 * - formUrl、formInfoEntry：Google 表單網址和「網站資訊」那一題的 entry 編號，空字串 = 反饋改開 GitHub Issue
 */
export const TELEMETRY: TelemetryConfig = {
  goatcounter: '',
  host: 'vincent0926.github.io',
  formUrl: '',
  formInfoEntry: '',
  repo: 'vincent0926/FRC-elevator-PID-Teaching-website',
}

/** 使用者關掉統計（存在 localStorage，下次來還是關的） */
const OPT_OUT_KEY = 'stats-off'
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

export function useStatsOptOut() {
  return usePersisted<boolean>(OPT_OUT_KEY, false, { parse: guard(isBool) })
}

function doNotTrack(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean }
  return n.doNotTrack === '1' || n.globalPrivacyControl === true
}

function send(path: string, event: boolean) {
  try {
    const env = {
      hostname: location.hostname,
      webdriver: navigator.webdriver === true,
      optedOut: readPersisted(OPT_OUT_KEY, false, guard(isBool)),
      doNotTrack: doNotTrack(),
    }
    if (!shouldCount(TELEMETRY, env)) return
    const url = countUrl(TELEMETRY.goatcounter, {
      path,
      event,
      screen: { width: screen.width, height: screen.height, dpr: devicePixelRatio || 1 },
      rnd: Math.random().toString(36).slice(2, 8),
    })
    // 送不出去（離線、被擋）就算了，不影響網站
    fetch(url, { mode: 'no-cors', keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => {})
  } catch {
    // 不讓統計弄壞頁面
  }
}

/** 目前的機構，動作的路徑會加上它（例如 elevator/2f-read-file） */
let currentTrack = 'chooser'

/** 瀏覽：進站畫面、選機構，或某個機構的某一層 */
export function countView(track: string | null, page: string) {
  currentTrack = track ?? 'chooser'
  send(track ? `${track}/${page}` : page, false)
  // 語言每個分頁記一次
  if (loadSession('stats-lang') === null) {
    saveSession('stats-lang', '1')
    send(`lang/${getLang()}`, true)
  }
}

/** 主要動作：2F 讀取日誌、完成教學關卡、選射球用法、打開反饋 */
export function countEvent(name: string) {
  send(`${currentTrack}/${name}`, true)
}
