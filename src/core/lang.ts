/**
 * 介面語言（決策 132）：中文是原文，英文是翻譯，兩個寫在同一個地方 t('中文', 'English')。
 * 純 TypeScript，core、Worker、測試都能用；預設中文，測試不用設定。
 * 換語言時網頁重新載入（模組層級的常數也是用 t() 算的，重新載入才會換）。
 */

export type Lang = 'zh' | 'en'

let current: Lang = 'zh'

export function setLang(lang: Lang): void {
  current = lang
}

export function getLang(): Lang {
  return current
}

/** 目前語言的那一個；字串、JSX、函式都可以 */
export function t<T>(zh: T, en: T): T {
  return current === 'en' ? en : zh
}
