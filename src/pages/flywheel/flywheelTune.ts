import type { FlywheelGains, FlywheelKnobs, MoveOutcome, ShotOutcome } from '../../core/flywheel/flywheel'
import { t } from '../../core/lang'
import { fixed as fx } from '../../core/format'

/** 射球飛輪的滑桿：範圍跟著理論值，單位一律 Phoenix 6 的 rps（kS 是伏特）。內部值是 SI（rad/s）。 */

const TAU = 2 * Math.PI

export const GAIN_ROWS: { k: keyof FlywheelGains; label: string; unit: string; hint: string }[] = [
  { k: 'kS', label: 'kS', unit: 'V', hint: t('抵銷摩擦的固定電壓。太小轉速一直差一點', 'Fixed voltage to cancel friction. Too small and the speed stays a little low') },
  { k: 'kV', label: 'kV', unit: 'V/rps', hint: t('每 1 rps 要多少電壓。飛輪主要靠它：對了不用回授就幾乎到速', 'Volts per 1 rps. A flywheel runs mainly on this: get it right and it nearly reaches speed without feedback') },
  { k: 'kA', label: 'kA', unit: 'V/(rps/s)', hint: t('加速時多給的電壓。只在有加速度限制時有用', 'Extra voltage while accelerating. Only matters with an acceleration limit') },
  { k: 'kP', label: 'kP', unit: 'V/rps', hint: t('差 1 rps 多給多少電壓。越大掉速越快補回來', 'Extra volts per 1 rps of error. Bigger makes up drops faster') },
  { k: 'kI', label: 'kI', unit: 'V/rot', hint: t('誤差累積起來補。起步時會累積太多而衝過頭，飛輪通常不用', 'Adds up the error over time. It builds up too much during spin-up and overshoots, so flywheels usually don’t use it') },
  { k: 'kD', label: 'kD', unit: 'V/(rps/s)', hint: t('看誤差變多快。飛輪幾乎不用', 'Reacts to how fast the error changes. Almost never used on flywheels') },
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
    title: t('只有前饋', 'Feedforward only'),
    note: t('kP = 0、kS 補上摩擦：轉速還是會到，因為 kV 對了。可是每一發掉下去只能慢慢自己爬回來。', 'kP = 0 with kS covering friction: it still reaches speed because kV is right, but after every shot it can only crawl back slowly on its own.'),
    gains: (t, k) => ({ ...t, kS: k.friction, kP: 0 }),
  },
  {
    id: 'kVLow',
    title: t('kV 少 20%', 'kV 20% low'),
    note: t('前饋給太少，轉速停在目標下面；只靠 kP 補不滿，差多少看 kP 多大。先把 kV 調對，不要用 kP 硬拉。', 'Too little feedforward, so the speed settles below the target; kP alone can’t fill the gap, and how far off it is depends on kP. Get kV right first instead of forcing it with kP.'),
    gains: (t, k) => ({ ...t, kS: k.friction, kV: t.kV * 0.8 }),
  },
  {
    id: 'kITooBig',
    title: t('kI 太大', 'kI too big'),
    note: t('起步那段誤差很大，積分一直累積，到目標時還在推，就衝過頭再慢慢掉回來。飛輪 kV 對了就不需要 kI。', 'The error is large during spin-up, so the integral keeps building and is still pushing when it reaches the target: it overshoots, then slowly falls back. With kV right a flywheel doesn’t need kI.'),
    gains: (t) => ({ ...t, kI: 1 / TAU }),
  },
  {
    id: 'tuned',
    title: t('調好的範例', 'Tuned example'),
    note: t('kS 補上摩擦、kP 加到 1 V/rps：掉速變淺，0.05 秒內就回來。kP 再加下去，掉速時電流就貼著限制，不會更快。', 'kS covers friction and kP goes up to 1 V/rps: the drops get shallower and recover within 0.05 s. Raise kP further and the current pins at the limit during drops, so it gets no faster.'),
    gains: (t, k) => ({ ...t, kS: k.friction, kP: 1 / TAU }),
  },
]

/** 「進了」「近 12 cm」「打不到 2.0 m 高」 */
export function missText(o: ShotOutcome, goalHeight?: number): string {
  if (!Number.isFinite(o.range)) return goalHeight === undefined ? t('打不到目標高度', 'Can’t reach the target height') : t(`打不到 ${fx(goalHeight, 1)} m 高`, `Can’t reach ${fx(goalHeight, 1)} m`)
  const d = t(`${o.miss >= 0 ? '遠' : '近'} ${fx(Math.abs(o.miss) * 100, 0)} cm`, `${fx(Math.abs(o.miss) * 100, 0)} cm ${o.miss >= 0 ? 'long' : 'short'}`)
  return o.hit ? t(`進了（${d}）`, `In (${d})`) : t(`沒進，${d}`, `Miss, ${d}`)
}

/** 邊移動邊射每一發偏多少：遠近、左右 */
export function moveMissText(o: MoveOutcome, goalHeight: number): string {
  if (!Number.isFinite(o.miss)) return t(`打不到 ${fx(goalHeight, 1)} m 高`, `Can’t reach ${fx(goalHeight, 1)} m`)
  const d = t(
    `${o.miss >= 0 ? '遠' : '近'} ${fx(Math.abs(o.miss) * 100, 0)} cm、偏${o.side >= 0 ? '右' : '左'} ${fx(Math.abs(o.side) * 100, 0)} cm`,
    `${fx(Math.abs(o.miss) * 100, 0)} cm ${o.miss >= 0 ? 'long' : 'short'}, ${fx(Math.abs(o.side) * 100, 0)} cm ${o.side >= 0 ? 'right' : 'left'}`,
  )
  return o.hit ? t(`進了（${d}）`, `In (${d})`) : t(`沒進，${d}`, `Miss, ${d}`)
}

/** 底盤偏角：面向目標時往左、往右偏幾度 */
export function yawText(yaw: number): string {
  const d = Math.abs((yaw * 180) / Math.PI)
  if (d < 0.05) return t('正對目標', 'facing the target')
  return t(`往${yaw > 0 ? '左' : '右'}偏 ${fx(d, 1)}°`, `turned ${fx(d, 1)}° ${yaw > 0 ? 'left' : 'right'}`)
}
