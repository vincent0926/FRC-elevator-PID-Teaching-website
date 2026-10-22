import { loadJson, saveJson } from '../storage/local'
import { t } from '../core/lang'

/**
 * 配色風格：跟深淺色是兩件事，每種風格都有淺色和深色兩組（theme.css 的 data-palette 段落）。
 * 一進站就套用（main.tsx import），選機構的畫面也看得到。
 */

export type Palette = 'default' | 'nordic' | 'tech' | 'cute'

export const PALETTES: { id: Palette; name: string }[] = [
  { id: 'default', name: t('預設', 'Default') },
  { id: 'nordic', name: t('北歐簡約', 'Nordic') },
  { id: 'tech', name: t('科技', 'Tech') },
  { id: 'cute', name: t('可愛', 'Cute') },
]

function isPalette(v: unknown): v is Palette {
  return PALETTES.some((p) => p.id === v)
}

/** 存的值不認得（舊版、手改過）就用預設 */
export function loadPalette(): Palette {
  const v = loadJson<unknown>('palette', 'default')
  return isPalette(v) ? v : 'default'
}

export function applyPalette(p: Palette) {
  if (p === 'default') delete document.documentElement.dataset.palette
  else document.documentElement.dataset.palette = p
  // 圖表的線條顏色是畫的時候讀 CSS 變數，換配色要叫它重畫
  window.dispatchEvent(new Event('themechange'))
}

export function setPalette(p: Palette) {
  saveJson('palette', p)
  applyPalette(p)
}

applyPalette(loadPalette())
