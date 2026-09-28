/**
 * 播放到第幾格。elapsedMs 是從第一格動畫開始算的時間；
 * requestAnimationFrame 給的時間可能比按下播放時還早（負值），所以一律夾在 [from, last]。
 */
export function frameIndex(from: number, last: number, elapsedMs: number, dt: number, speed: number): number {
  const step = Math.floor((Math.max(0, elapsedMs) / 1000 / dt) * speed)
  return Math.max(from, Math.min(last, from + (Number.isFinite(step) ? step : 0)))
}
