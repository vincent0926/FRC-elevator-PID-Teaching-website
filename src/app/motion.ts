/** 進站過場的時間和計時（決策 147）；毫秒數要跟 theme.css 的動畫一樣 */

/** 門關上的時間（`door-close`） */
export const DOOR_CLOSE_MS = 450

/** 按「開始」到換成選機構的時間：爆光、門在 0.7 秒開始關、亮隊號（`.splash.leaving`，決策 148） */
export const SPLASH_LEAVE_MS = 1500

/** 選到的卡片彈一下的時間（`card-pick`），之後門開始關 */
export const PICK_MS = 280

/** 系統有沒有設「減少動態效果」 */
export function reducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 播完過場（`ms` 毫秒）才執行；減少動態效果時馬上執行 */
export function afterMotion(ms: number, fn: () => void) {
  if (reducedMotion()) fn()
  else window.setTimeout(fn, ms)
}
