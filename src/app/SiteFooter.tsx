import { countingConfigured, feedbackUrl } from '../core/telemetry'
import { getLang, t } from '../core/lang'
import { TELEMETRY, countEvent, useStatsOptOut } from './telemetry'

/**
 * 每一頁最下面：「回報問題／給建議」和匿名使用統計的說明、開關（決策 159、160）。
 * 選機構畫面和每一層樓都有，射球飛輪沒有使用說明頁也看得到。
 */
export function SiteFooter({ track, page }: { track: string | null; page: string }) {
  const [optedOut, setOptedOut] = useStatsOptOut()
  const href = feedbackUrl(TELEMETRY, { version: __APP_VERSION__, track, page, lang: getLang() })
  const viaForm = TELEMETRY.formUrl !== ''
  return (
    <footer className="site-foot small muted">
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => countEvent('feedback-open')}>
        {t('回報問題／給建議', 'Report a problem / suggest something')}
      </a>
      <span className="site-foot-note">
        {viaForm
          ? t('（Google 表單，不用帳號）', '(Google Form, no account needed)')
          : t('（GitHub，要登入）', '(GitHub, sign-in required)')}
      </span>
      {countingConfigured(TELEMETRY) && (
        <details className="site-foot-stats">
          <summary>{optedOut ? t('匿名使用統計：已關閉', 'Anonymous usage stats: off') : t('匿名使用統計：開啟', 'Anonymous usage stats: on')}</summary>
          <p>
            {t(
              '網站會記錄進了哪個機構、哪一層樓，和幾個主要動作（2F 讀取日誌、完成教學關卡、選射球飛輪的用法、打開反饋），用來知道大家怎麼用、該先改哪裡。不用 cookie，不記錄你填的數字、檔案或日誌內容，也不記錄姓名、帳號。統計服務是 GoatCounter；瀏覽器開了「不要追蹤」也不會記錄。',
              'The site records which mechanism and floor you open, plus a few main actions (reading a log in 2F, finishing a lesson, choosing a flywheel mode, opening feedback), so we know how it is used and what to improve first. No cookies, and nothing you type, no files or log contents, no names or accounts. The stats service is GoatCounter; nothing is recorded if your browser sends “Do Not Track”.',
            )}
          </p>
          <button type="button" className="btn small" onClick={() => setOptedOut(!optedOut)}>
            {optedOut ? t('開啟統計', 'Turn stats on') : t('關閉統計', 'Turn stats off')}
          </button>
        </details>
      )}
    </footer>
  )
}
