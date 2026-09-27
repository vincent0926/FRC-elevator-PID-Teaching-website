import type { AlignedLog } from '../log/fieldMap'

/**
 * 步驟 1 的切段：依「參考」速度與加速度把每一筆資料分成
 *   靜止保持、加速、等速、減速、到位穩定（移動結束後的一段時間）
 * 往上、往下分開標記。相位交界的樣本標成 transition，不拿來迴歸（差分出來的參考加速度在那裡不準）。
 */

export const PHASES = ['off', 'hold', 'accel', 'cruise', 'decel', 'settle', 'transition'] as const
export type Phase = (typeof PHASES)[number]
export const PHASE_LABEL: Record<Phase, string> = {
  off: '未 Enable',
  hold: '靜止保持',
  accel: '加速',
  cruise: '等速',
  decel: '減速',
  settle: '到位穩定',
  transition: '交界',
}
const P = Object.fromEntries(PHASES.map((p, i) => [p, i])) as Record<Phase, number>

export interface MoveSpan {
  dir: 1 | -1
  start: number
  /** 軌跡結束（參考速度回到 0）的時間 */
  profileEnd: number
  /** 到位穩定段結束的時間 */
  end: number
  startIdx: number
  profileEndIdx: number
  endIdx: number
  goal: number
}

export interface Segments {
  /** 每筆資料的相位（PHASES 的索引） */
  phase: Uint8Array
  /** 參考速度方向：1 往上、-1 往下、0 停 */
  dir: Int8Array
  vref: Float64Array
  aref: Float64Array
  moves: MoveSpan[]
  /** 參考加速度的量級（m/s²），給門檻用 */
  aScale: number
  vScale: number
}

export interface SegmentOptions {
  /** 軌跡結束後算「到位穩定」的時間（s） */
  settleWindow?: number
}

function derivative(t: Float64Array, y: Float64Array): Float64Array {
  const n = y.length
  const d = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    const dt = t[b] - t[a]
    d[i] = dt > 0 && Number.isFinite(y[a]) && Number.isFinite(y[b]) ? (y[b] - y[a]) / dt : 0
  }
  return d
}

function percentileAbs(x: Float64Array, q: number): number {
  const v = Array.from(x, Math.abs).filter(Number.isFinite).sort((a, b) => a - b)
  return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 0
}

export function phaseIs(seg: Segments, i: number, ...ps: Phase[]): boolean {
  return ps.some((p) => seg.phase[i] === P[p])
}

export function segment(log: AlignedLog, opt: SegmentOptions = {}): Segments {
  const { t, cols } = log
  const n = t.length
  const settleWindow = opt.settleWindow ?? 0.5
  const ref = cols.reference
  if (!ref) throw new Error('缺少目標位置欄位，無法切段')
  const vref = cols.referenceSlope ? Float64Array.from(cols.referenceSlope, (v) => (Number.isFinite(v) ? v : 0)) : derivative(t, ref)
  const aref = derivative(t, vref)
  const vScale = percentileAbs(vref, 0.98)
  // 只在移動中找加速度量級，靜止時的 0 會把百分位拉低
  const movingAref = Float64Array.from(aref.filter((_, i) => Math.abs(vref[i]) > 0.05 * vScale))
  const aScale = movingAref.length ? percentileAbs(movingAref, 0.9) : 0
  const vTh = Math.max(0.005, 0.02 * vScale)
  // 加速段比一格取樣還短時 aScale 只剩雜訊，門檻要有下限，不然等速段會被雜訊切成加減速
  const aTh = Math.max(0.3 * aScale, 0.2)

  const raw = new Uint8Array(n)
  const dir = new Int8Array(n)
  const en = cols.enabled
  for (let i = 0; i < n; i++) {
    if (en && en[i] !== 1) {
      raw[i] = P.off
      continue
    }
    const v = vref[i]
    if (Math.abs(v) <= vTh) {
      raw[i] = P.hold
      continue
    }
    dir[i] = v > 0 ? 1 : -1
    const a = aref[i]
    raw[i] = Math.abs(a) < aTh ? P.cruise : Math.sign(a) === Math.sign(v) ? P.accel : P.decel
  }

  // 找移動段，軌跡結束後 settleWindow 內標成到位穩定
  const moves: MoveSpan[] = []
  const phase = raw.slice()
  let i = 0
  while (i < n) {
    if (raw[i] === P.hold || raw[i] === P.off) {
      i++
      continue
    }
    const startIdx = i
    const d = dir[i] as 1 | -1
    while (i < n && raw[i] !== P.hold && raw[i] !== P.off && dir[i] === d) i++
    const profileEndIdx = Math.min(n - 1, i)
    let endIdx = profileEndIdx
    while (endIdx + 1 < n && raw[endIdx + 1] === P.hold && t[endIdx + 1] - t[profileEndIdx] <= settleWindow) endIdx++
    for (let k = profileEndIdx; k <= endIdx; k++) if (raw[k] === P.hold) phase[k] = P.settle
    moves.push({
      dir: d,
      start: t[startIdx],
      profileEnd: t[profileEndIdx],
      end: t[endIdx],
      startIdx,
      profileEndIdx,
      endIdx,
      goal: ref[profileEndIdx],
    })
  }

  // 交界：前後相位不同的樣本（含移動方向改變）。
  // 緊鄰移動段的靜止樣本也算：差分出來的參考加速度會糊到那一格
  const moving = (x: number) => x === P.accel || x === P.cruise || x === P.decel
  for (let k = 1; k < n - 1; k++) {
    if (phase[k] === P.off) continue
    if (raw[k - 1] !== raw[k] || raw[k + 1] !== raw[k]) {
      if (moving(raw[k]) || moving(raw[k - 1]) || moving(raw[k + 1])) phase[k] = P.transition
    }
  }

  return { phase, dir, vref, aref, moves, aScale, vScale }
}

/** 把某些相位的樣本整理成時段（給圖表標示）。 */
export function spansWhere(t: Float64Array, pred: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = []
  let s = -1
  for (let i = 0; i < t.length; i++) {
    const on = pred(i)
    if (on && s < 0) s = i
    if (!on && s >= 0) {
      out.push([t[s], t[i - 1]])
      s = -1
    }
  }
  if (s >= 0) out.push([t[s], t[t.length - 1]])
  return out
}
