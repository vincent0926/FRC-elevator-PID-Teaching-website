import { getLang } from '../core/lang'
import { switchLang } from './langInit'

/** 右上角的中/EN 切換：目前的語言是粗體，按另一個就換 */
export function LangToggle() {
  const lang = getLang()
  return (
    <div className="lang-toggle" role="group" aria-label="Language / 語言">
      <button type="button" aria-pressed={lang === 'zh'} lang="zh-Hant" onClick={() => lang !== 'zh' && switchLang('zh')}>
        中
      </button>
      <button type="button" aria-pressed={lang === 'en'} lang="en" onClick={() => lang !== 'en' && switchLang('en')}>
        EN
      </button>
    </div>
  )
}
