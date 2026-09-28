/**
 * 3F「親手調參數」滑桿的範圍。以理論值為中心，讓 0 到「明顯太大」都拉得到；
 * 理論值是 0（kI、常見的 kD）時改用 kP 推一個合理上限。
 */

export type TuneKey = 'kS' | 'kG' | 'kV' | 'kA' | 'kP' | 'kI' | 'kD' | 'cruiseVelocity' | 'acceleration'

export interface TuneGains {
  feedforward: { kS: number; kG: number; kV: number; kA: number }
  feedback: { kP: number; kI: number; kD: number }
  motionMagic: { cruiseVelocity: number; acceleration: number }
}

export interface SliderRange {
  min: number
  max: number
  step: number
}

export function getGain(g: TuneGains, k: TuneKey): number {
  if (k === 'cruiseVelocity' || k === 'acceleration') return g.motionMagic[k]
  if (k === 'kP' || k === 'kI' || k === 'kD') return g.feedback[k]
  return g.feedforward[k]
}

export function setGain<T extends TuneGains>(g: T, k: TuneKey, v: number): T {
  if (k === 'cruiseVelocity' || k === 'acceleration') return { ...g, motionMagic: { ...g.motionMagic, [k]: v } }
  if (k === 'kP' || k === 'kI' || k === 'kD') return { ...g, feedback: { ...g.feedback, [k]: v } }
  return { ...g, feedforward: { ...g.feedforward, [k]: v } }
}

/** 往上取到 1、2、2.5、5 × 10ⁿ */
export function niceCeil(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 1
  const p = 10 ** Math.floor(Math.log10(x))
  const m = x / p
  const n = m <= 1 + 1e-9 ? 1 : m <= 2 + 1e-9 ? 2 : m <= 2.5 + 1e-9 ? 2.5 : m <= 5 + 1e-9 ? 5 : 10
  return n * p
}

/** 往上取到 1、2、5 × 10ⁿ（步距用，小數位比較乾淨） */
function niceStep(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 0.01
  const p = 10 ** Math.floor(Math.log10(x))
  const m = x / p
  return (m <= 1 + 1e-9 ? 1 : m <= 2 + 1e-9 ? 2 : m <= 5 + 1e-9 ? 5 : 10) * p
}

const fin = (v: number) => (Number.isFinite(v) ? v : 0)

/**
 * 滑桿範圍。current 超出預設範圍（例如在數字欄打了很大的值）時把範圍撐開，滑桿才不會卡在端點。
 * 軌跡的巡航速度、加速度一定大於 0。
 */
export function sliderRange(k: TuneKey, theory: TuneGains, current: number): SliderRange {
  const t = fin(getGain(theory, k))
  const kP = Math.abs(fin(theory.feedback.kP)) || 1
  const cur = fin(current)
  let hi: number
  switch (k) {
    case 'kS':
      hi = Math.max(3 * t, 1)
      break
    case 'kG':
      hi = Math.max(2 * t, 0.5)
      break
    case 'kV':
      hi = Math.max(2 * t, 1)
      break
    case 'kA':
      hi = Math.max(3 * t, 0.1)
      break
    case 'kP':
      hi = 4 * kP
      break
    case 'kI':
      hi = Math.max(3 * t, 2 * kP)
      break
    case 'kD':
      hi = Math.max(4 * t, 0.25 * kP)
      break
    default:
      hi = 1.5 * t
  }
  // 跟取整後的上限比：拉到端點（= max）時範圍不能再變大，不然越拖越大停不下來
  let max = niceCeil(hi)
  if (cur > max) max = niceCeil(cur * 1.25)
  const step = niceStep(max / 250)
  if (k === 'cruiseVelocity' || k === 'acceleration') return { min: step, max, step }
  // 配重比重力大時 kG 是負的；kS、kG 允許負值，其他從 0 開始
  const low = k === 'kS' || k === 'kG' ? Math.min(0, 2 * t, cur) : 0
  const min = low < 0 ? -niceCeil(-low) : 0
  return { min, max, step }
}

/** 對齊到步距，避免 0.30000000000000004 這種數字 */
export function snap(v: number, step: number): number {
  const d = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  return Number((Math.round(v / step) * step).toFixed(d))
}
