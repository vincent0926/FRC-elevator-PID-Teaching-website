import type { ParameterSet } from '../schema/parameterSet'

/**
 * 兩組參數逐項比較（參數庫「跟目前的比」用）。
 * 只比控制參數；機構資料不同時另外標出來，因為那代表兩組不是同一台電梯算的。
 */

export interface ParamField {
  key: string
  label: string
  unit: string
  get: (p: ParameterSet) => number | undefined
}

export const PARAM_FIELDS: ParamField[] = [
  { key: 'kS', label: 'kS', unit: 'V', get: (p) => p.feedforward.kS },
  { key: 'kG', label: 'kG', unit: 'V', get: (p) => p.feedforward.kG },
  { key: 'kV', label: 'kV', unit: 'V/(m/s)', get: (p) => p.feedforward.kV },
  { key: 'kA', label: 'kA', unit: 'V/(m/s²)', get: (p) => p.feedforward.kA },
  { key: 'kP', label: 'kP', unit: 'V/m', get: (p) => p.feedback.kP },
  { key: 'kI', label: 'kI', unit: 'V/(m·s)', get: (p) => p.feedback.kI },
  { key: 'kD', label: 'kD', unit: 'V/(m/s)', get: (p) => p.feedback.kD },
  { key: 'cruise', label: '巡航速度', unit: 'm/s', get: (p) => p.motionMagic.cruiseVelocity },
  { key: 'accel', label: '加速度', unit: 'm/s²', get: (p) => p.motionMagic.acceleration },
  { key: 'kGDown', label: 'kG（往下 Slot 1）', unit: 'V', get: (p) => p.slotByDirection?.down.kG },
]

export interface ParamDiffRow {
  key: string
  label: string
  unit: string
  a: number | undefined
  b: number | undefined
  /** 相對差（b 相對 a）；任一邊沒有或 a 為 0 時為 null */
  rel: number | null
  changed: boolean
}

export function diffParams(a: ParameterSet, b: ParameterSet, relTol = 1e-6): { rows: ParamDiffRow[]; sameMechanism: boolean } {
  const rows = PARAM_FIELDS.map((f) => {
    const va = f.get(a)
    const vb = f.get(b)
    const changed = va === undefined || vb === undefined ? va !== vb : Math.abs(va - vb) > Math.max(Math.abs(va), Math.abs(vb), 1e-9) * relTol
    const rel = va === undefined || vb === undefined || va === 0 ? null : (vb - va) / Math.abs(va)
    return { key: f.key, label: f.label, unit: f.unit, a: va, b: vb, rel, changed }
  }).filter((r) => r.a !== undefined || r.b !== undefined)
  return { rows, sameMechanism: JSON.stringify(a.mechanism) === JSON.stringify(b.mechanism) }
}
