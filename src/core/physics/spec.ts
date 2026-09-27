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

/**
 * 教學用的標準（不是 FRC 官方標準，FRC 沒有這種規定）：依賽季、機構、得分位置選一個，再微調。
 * id 沿用舊的（存在瀏覽器裡的標準比對數值，不看 id）。
 */
export const SPEC_PRESETS: { id: string; label: string; what: string; spec: Spec }[] = [
  { id: 'precise', label: '保守', what: '要把遊戲物件放進很窄的位置：超調和穩態誤差 5 mm', spec: { ...DEFAULT_SPEC, overshoot: 0.005, steadyState: 0.005, following: 0.02 } },
  { id: 'default', label: '平衡（預設教學標準）', what: '一般的電梯，得分位置 ±1 cm', spec: DEFAULT_SPEC },
  { id: 'fast', label: '快速', what: '只要大概到就好、重點是快：允許 3 cm 誤差、穩定時間 0.3 s', spec: { ...DEFAULT_SPEC, overshoot: 0.03, steadyState: 0.03, following: 0.06, settling: 0.3 } },
]

export function isSpec(v: unknown): v is Spec {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (Object.keys(DEFAULT_SPEC) as (keyof Spec)[]).every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) > 0)
}

/** 位置的單位：電梯是公尺（顯示公分），手臂是弧度（顯示度） */
export type SpecUnit = 'm' | 'rad'

/** 長度或角度誤差的顯示：m → cm、rad → ° */
export function fmtPos(v: number, unit: SpecUnit = 'm', digits = 1): string {
  return unit === 'rad' ? `${Number(((v * 180) / Math.PI).toFixed(digits))}°` : `${Number((v * 100).toFixed(digits))} cm`
}

/** 手臂的教學用標準（角度）：超調 2°、穩態 1°、跟隨 3° */
export const ARM_DEFAULT_SPEC: Spec = { overshoot: (2 * Math.PI) / 180, settling: 0.5, steadyState: Math.PI / 180, following: (3 * Math.PI) / 180, saturation: 0.02, ripple: 0.3 }

export const ARM_SPEC_PRESETS: { id: string; label: string; what: string; spec: Spec }[] = [
  { id: 'precise', label: '保守', what: '要把遊戲物件放進很窄的位置：超調和穩態誤差 0.5°', spec: { ...ARM_DEFAULT_SPEC, overshoot: (0.5 * Math.PI) / 180, steadyState: (0.5 * Math.PI) / 180, following: (2 * Math.PI) / 180 } },
  { id: 'default', label: '平衡（預設教學標準）', what: '一般的手臂，得分角度 ±1°', spec: ARM_DEFAULT_SPEC },
  { id: 'fast', label: '快速', what: '大概到就好、重點是快：允許 3° 誤差、穩定時間 0.3 s', spec: { ...ARM_DEFAULT_SPEC, overshoot: (3 * Math.PI) / 180, steadyState: (3 * Math.PI) / 180, following: (6 * Math.PI) / 180, settling: 0.3 } },
]

export function describeSpec(s: Spec, unit: SpecUnit = 'm'): string {
  const cm = (v: number) => fmtPos(v, unit)
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

/** 每一項沒過時：可能的原因、先試什麼（3F 指標表逐次移動顯示） */
export const SPEC_ADVICE: Record<keyof Spec, { cause: string; next: string }> = {
  overshoot: { cause: 'kP 太大、kD 不夠、有 kI 的積分飽和，或軌跡太快追不上', next: '先降 kP 或加一點 kD；有 kI 的話先拿掉' },
  settling: { cause: '到位後在振盪，或 kP 太小慢慢爬', next: '看位置圖：來回擺就降 kP／加 kD，慢慢爬就先檢查 kG、kS 再加 kP' },
  steadyState: { cause: '前饋撐不住：kG 不準，或靜摩擦 kS 卡住', next: '修 kG（回授一直偏同一邊）、補 kS；不要急著加 kI' },
  following: { cause: '前饋沒跟上軌跡：kV、kA 不準，或輸出飽和', next: '先確認沒飽和，再修 kV（等速段）、kA（加減速段）' },
  saturation: { cause: '物理限制：馬達已經全力，軌跡要的比電池給得起的多', next: '降低 Motion Magic 速度或加速度，調 PID 沒用' },
  ripple: { cause: '到位後電壓抖：振盪（kP 太大、控制週期長、延遲）或 kD 放大雜訊', next: '位置也在抖就降 kP；位置不動只有電壓抖就降 kD' },
}

export interface MoveDiagnosis {
  key: keyof Spec
  label: string
  actual: string
  limit: string
  cause: string
  next: string
}

/** 一次移動沒過的每一項，附數值、門檻、原因與建議 */
export function diagnoseMove(m: MoveMetrics, spec: Spec = DEFAULT_SPEC, unit: SpecUnit = 'm'): MoveDiagnosis[] {
  const cm = (v: number) => fmtPos(v, unit)
  const fmt: Record<keyof Spec, [string, string]> = {
    overshoot: [cm(m.overshoot), cm(spec.overshoot)],
    settling: [m.settlingTime === null ? '沒穩定' : `${m.settlingTime.toFixed(2)} s`, `${spec.settling} s`],
    steadyState: [cm(m.steadyStateError), cm(spec.steadyState)],
    following: [cm(m.maxFollowingError), cm(spec.following)],
    saturation: [`${(m.saturationFraction * 100).toFixed(1)}%`, `${(spec.saturation * 100).toFixed(1)}%`],
    ripple: [`${m.holdVoltageRipple.toFixed(2)} V`, `${spec.ripple} V`],
  }
  return moveFailures(m, spec).map((key) => ({ key, label: SPEC_LABEL[key], actual: fmt[key][0], limit: fmt[key][1], ...SPEC_ADVICE[key] }))
}
