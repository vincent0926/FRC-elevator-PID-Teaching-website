import type { FlywheelGains, FlywheelKnobs, MoveOutcome, ShotOutcome } from '../../core/flywheel/flywheel'

/** 射球飛輪的滑桿：範圍跟著理論值，單位一律 Phoenix 6 的 rps（kS 是伏特）。內部值是 SI（rad/s）。 */

const TAU = 2 * Math.PI

export const GAIN_ROWS: { k: keyof FlywheelGains; label: string; unit: string; hint: string }[] = [
  { k: 'kS', label: 'kS', unit: 'V', hint: '抵銷摩擦的固定電壓。太小轉速一直差一點' },
  { k: 'kV', label: 'kV', unit: 'V/rps', hint: '每 1 rps 要多少電壓。飛輪主要靠它：對了不用回授就幾乎到速' },
  { k: 'kA', label: 'kA', unit: 'V/(rps/s)', hint: '加速時多給的電壓。只在有加速度限制時有用' },
  { k: 'kP', label: 'kP', unit: 'V/rps', hint: '差 1 rps 多給多少電壓。越大掉速越快補回來' },
  { k: 'kI', label: 'kI', unit: 'V/rot', hint: '誤差累積起來補。起步時會累積太多而衝過頭，飛輪通常不用' },
  { k: 'kD', label: 'kD', unit: 'V/(rps/s)', hint: '看誤差變多快。飛輪幾乎不用' },
]

/** 滑桿範圍（SI）。目前值超出範圍時把上限撐大，滑桿才不會卡在邊上。 */
export function gainRange(k: keyof FlywheelGains, theory: FlywheelGains, v: number): { min: number; max: number; step: number } {
  const per = k === 'kS' ? 1 : 1 / TAU
  const base: Record<keyof FlywheelGains, { max: number; step: number }> = {
    kS: { max: 0.5, step: 0.005 },
    kV: { max: 2 * theory.kV * TAU, step: 0.001 },
    kA: { max: Math.max(3 * theory.kA * TAU, 0.05), step: 0.001 },
    kP: { max: 2, step: 0.01 },
    kI: { max: 2, step: 0.01 },
    kD: { max: 0.05, step: 0.0005 },
  }
  const b = base[k]
  return { min: 0, max: Math.max(b.max * per, v * 1.2), step: b.step * per }
}

export interface FlywheelPreset {
  id: string
  title: string
  note: string
  gains: (theory: FlywheelGains, knobs: FlywheelKnobs) => FlywheelGains
}

export const FLYWHEEL_PRESETS: FlywheelPreset[] = [
  {
    id: 'ffOnly',
    title: '只有前饋',
    note: 'kP = 0、kS 補上摩擦：轉速還是會到，因為 kV 對了。可是每一發掉下去只能慢慢自己爬回來。',
    gains: (t, k) => ({ ...t, kS: k.friction, kP: 0 }),
  },
  {
    id: 'kVLow',
    title: 'kV 少 20%',
    note: '前饋給太少，轉速停在目標下面；只靠 kP 補不滿，差多少看 kP 多大。先把 kV 調對，不要用 kP 硬拉。',
    gains: (t, k) => ({ ...t, kS: k.friction, kV: t.kV * 0.8 }),
  },
  {
    id: 'kITooBig',
    title: 'kI 太大',
    note: '起步那段誤差很大，積分一直累積，到目標時還在推，就衝過頭再慢慢掉回來。飛輪 kV 對了就不需要 kI。',
    gains: (t) => ({ ...t, kI: 1 / TAU }),
  },
  {
    id: 'tuned',
    title: '調好的範例',
    note: 'kS 補上摩擦、kP 加到 1 V/rps：掉速變淺，0.05 秒內就回來。kP 再加下去，掉速時電流就貼著限制，不會更快。',
    gains: (t, k) => ({ ...t, kS: k.friction, kP: 1 / TAU }),
  },
]

const fx = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '—')

/** 「進了」「近 12 cm」「打不到 2.0 m 高」 */
export function missText(o: ShotOutcome, goalHeight?: number): string {
  if (!Number.isFinite(o.range)) return goalHeight === undefined ? '打不到目標高度' : `打不到 ${fx(goalHeight, 1)} m 高`
  const d = `${o.miss >= 0 ? '遠' : '近'} ${fx(Math.abs(o.miss) * 100, 0)} cm`
  return o.hit ? `進了（${d}）` : `沒進，${d}`
}


/** 邊移動邊射每一發偏多少：遠近、左右 */
export function moveMissText(o: MoveOutcome, goalHeight: number): string {
  if (!Number.isFinite(o.miss)) return `打不到 ${fx(goalHeight, 1)} m 高`
  const d = `${o.miss >= 0 ? '遠' : '近'} ${fx(Math.abs(o.miss) * 100, 0)} cm、偏${o.side >= 0 ? '右' : '左'} ${fx(Math.abs(o.side) * 100, 0)} cm`
  return o.hit ? `進了（${d}）` : `沒進，${d}`
}

/** 底盤偏角：面向目標時往左、往右偏幾度 */
export function yawText(yaw: number): string {
  const d = Math.abs((yaw * 180) / Math.PI)
  if (d < 0.05) return '正對目標'
  return `往${yaw > 0 ? '左' : '右'}偏 ${fx(d, 1)}°`
}
