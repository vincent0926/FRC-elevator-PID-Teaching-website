import type { MoveMetrics } from './simulate'

/**
 * 達標標準。3F 指標表、穩健性測試、挑戰模式都用同一組。
 * 長度單位 m、時間 s、電壓 V；saturation 是時間比例。
 */
export interface Spec {
  overshoot: number
  settling: number
  steadyState: number
  following: number
  saturation: number
  ripple: number
}

export const DEFAULT_SPEC: Spec = { overshoot: 0.01, settling: 0.5, steadyState: 0.01, following: 0.03, saturation: 0.02, ripple: 0.3 }

/** 常用的標準：依賽季機構需求選一個，再微調 */
export const SPEC_PRESETS: { id: string; label: string; what: string; spec: Spec }[] = [
  { id: 'default', label: '預設', what: '得分位置要準（±1 cm），一般的電梯', spec: DEFAULT_SPEC },
  { id: 'precise', label: '精準放置', what: '要把遊戲物件放進很窄的位置：超調和穩態誤差 5 mm', spec: { ...DEFAULT_SPEC, overshoot: 0.005, steadyState: 0.005, following: 0.02 } },
  { id: 'fast', label: '快就好', what: '只要大概到就好、重點是快：允許 3 cm 誤差、穩定時間 0.3 s', spec: { ...DEFAULT_SPEC, overshoot: 0.03, steadyState: 0.03, following: 0.06, settling: 0.3 } },
]

export function isSpec(v: unknown): v is Spec {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (Object.keys(DEFAULT_SPEC) as (keyof Spec)[]).every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) > 0)
}

export function describeSpec(s: Spec): string {
  const cm = (v: number) => `${Number((v * 100).toFixed(1))} cm`
  return `超調 ≤ ${cm(s.overshoot)}、軌跡結束後 ${s.settling} s 內穩定在 ±${cm(s.steadyState)}、穩態誤差 ≤ ${cm(s.steadyState)}、跟隨誤差 ≤ ${cm(s.following)}、電壓飽和 ≤ ${Number((s.saturation * 100).toFixed(1))}%、到位後電壓抖動 ≤ ${s.ripple} V`
}

export const SPEC_LABEL: Record<keyof Spec, string> = {
  overshoot: '超調',
  settling: '穩定時間',
  steadyState: '穩態誤差',
  following: '跟隨誤差',
  saturation: '電壓飽和',
  ripple: '到位電壓抖動',
}

/** 這次移動沒過的項目（空陣列 = 全部達標） */
export function moveFailures(m: MoveMetrics, spec: Spec = DEFAULT_SPEC): (keyof Spec)[] {
  const f: (keyof Spec)[] = []
  if (m.overshoot > spec.overshoot) f.push('overshoot')
  if (m.settlingTime === null || m.settlingTime > spec.settling) f.push('settling')
  if (m.steadyStateError > spec.steadyState) f.push('steadyState')
  if (m.maxFollowingError > spec.following) f.push('following')
  if (m.saturationFraction > spec.saturation) f.push('saturation')
  if (m.holdVoltageRipple > spec.ripple) f.push('ripple')
  return f
}

export function passesSpec(moves: MoveMetrics[], spec: Spec = DEFAULT_SPEC): boolean {
  return moves.length > 0 && moves.every((m) => moveFailures(m, spec).length === 0)
}

/** 離規格多遠：每一項「實際 / 允許值」取最大，≤ 1 就是達標。用來挑最差的一次 */
export function specScore(moves: MoveMetrics[], spec: Spec = DEFAULT_SPEC): number {
  let s = 0
  for (const m of moves) {
    s = Math.max(
      s,
      m.overshoot / spec.overshoot,
      m.settlingTime === null ? 3 : m.settlingTime / spec.settling,
      m.steadyStateError / spec.steadyState,
      m.maxFollowingError / spec.following,
      m.saturationFraction / spec.saturation,
      m.holdVoltageRipple / spec.ripple,
    )
  }
  return s
}
