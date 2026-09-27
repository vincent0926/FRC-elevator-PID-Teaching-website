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
