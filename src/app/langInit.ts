import { setLang, type Lang } from '../core/lang'
import { loadJson, saveJson } from '../storage/local'

/**
 * 介面語言要在其他模組載入前決定（模組層級的常數也用 t()），所以 main.tsx 第一個 import 這個檔案。
 * 順序：上次按的中/EN → 瀏覽器語言（中文的話中文，其他英文）。
 */

function initialLang(): Lang {
  const saved = loadJson<string | null>('lang', null)
  if (saved === 'zh' || saved === 'en') return saved
  try {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'zh'
  }
}

const lang = initialLang()
setLang(lang)
document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant'
if (lang === 'en') document.title = 'Mechanism Tuning Station | FRC 9427'

/** 換語言：記住，再重新載入（機構、樓層存在 sessionStorage，重新載入不會不見） */
export function switchLang(next: Lang): void {
  saveJson('lang', next)
  location.reload()
}
