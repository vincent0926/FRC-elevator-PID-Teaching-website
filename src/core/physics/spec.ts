import type { MoveMetrics } from './simulate'
import { t } from '../lang'

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
  { id: 'precise', label: t('保守', 'Strict'), what: t('要把遊戲物件放進很窄的位置：超調和穩態誤差 5 mm', 'For placing game pieces in tight spots: 5 mm overshoot and steady-state error'), spec: { ...DEFAULT_SPEC, overshoot: 0.005, steadyState: 0.005, following: 0.02 } },
  { id: 'default', label: t('平衡（預設教學標準）', 'Balanced (default teaching criteria)'), what: t('一般的電梯，得分位置 ±1 cm', 'A typical elevator, scoring position ±1 cm'), spec: DEFAULT_SPEC },
  { id: 'fast', label: t('快速', 'Fast'), what: t('只要大概到就好、重點是快：允許 3 cm 誤差、穩定時間 0.3 s', 'Roughly there is good enough, speed matters: 3 cm error allowed, 0.3 s settling'), spec: { ...DEFAULT_SPEC, overshoot: 0.03, steadyState: 0.03, following: 0.06, settling: 0.3 } },
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
  { id: 'precise', label: t('保守', 'Strict'), what: t('要把遊戲物件放進很窄的位置：超調和穩態誤差 0.5°', 'For placing game pieces in tight spots: 0.5° overshoot and steady-state error'), spec: { ...ARM_DEFAULT_SPEC, overshoot: (0.5 * Math.PI) / 180, steadyState: (0.5 * Math.PI) / 180, following: (2 * Math.PI) / 180 } },
  { id: 'default', label: t('平衡（預設教學標準）', 'Balanced (default teaching criteria)'), what: t('一般的手臂，得分角度 ±1°', 'A typical arm, scoring angle ±1°'), spec: ARM_DEFAULT_SPEC },
  { id: 'fast', label: t('快速', 'Fast'), what: t('大概到就好、重點是快：允許 3° 誤差、穩定時間 0.3 s', 'Roughly there is good enough, speed matters: 3° error allowed, 0.3 s settling'), spec: { ...ARM_DEFAULT_SPEC, overshoot: (3 * Math.PI) / 180, steadyState: (3 * Math.PI) / 180, following: (6 * Math.PI) / 180, settling: 0.3 } },
]

export function describeSpec(s: Spec, unit: SpecUnit = 'm'): string {
  const cm = (v: number) => fmtPos(v, unit)
  return t(`超調 ≤ ${cm(s.overshoot)}、軌跡結束後 ${s.settling} s 內穩定在 ±${cm(s.steadyState)}、穩態誤差 ≤ ${cm(s.steadyState)}、跟隨誤差 ≤ ${cm(s.following)}、電壓飽和 ≤ ${Number((s.saturation * 100).toFixed(1))}%、到位後電壓抖動 ≤ ${s.ripple} V`, `overshoot ≤ ${cm(s.overshoot)}, settled within ±${cm(s.steadyState)} by ${s.settling} s after the profile ends, steady-state error ≤ ${cm(s.steadyState)}, following error ≤ ${cm(s.following)}, voltage saturation ≤ ${Number((s.saturation * 100).toFixed(1))}%, voltage jitter after arrival ≤ ${s.ripple} V`)
}

export const SPEC_LABEL: Record<keyof Spec, string> = {
  overshoot: t('超調', 'Overshoot'),
  settling: t('穩定時間', 'Settling time'),
  steadyState: t('穩態誤差', 'Steady-state error'),
  following: t('跟隨誤差', 'Following error'),
  saturation: t('電壓飽和', 'Voltage saturation'),
  ripple: t('到位電壓抖動', 'Voltage jitter at arrival'),
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
  overshoot: { cause: t('kP 太大、kD 不夠、有 kI 的積分飽和，或軌跡太快追不上', 'kP too big, not enough kD, integral windup from kI, or a profile too fast to follow'), next: t('先降 kP 或加一點 kD；有 kI 的話先拿掉', 'Lower kP or add a little kD first; if there’s kI, remove it first') },
  settling: { cause: t('到位後在振盪，或 kP 太小慢慢爬', 'Oscillating after arrival, or kP too small and creeping'), next: t('看位置圖：來回擺就降 kP／加 kD，慢慢爬就先檢查 kG、kS 再加 kP', 'Look at the position chart: swinging back and forth → lower kP / add kD; slowly creeping → check kG and kS before raising kP') },
  steadyState: { cause: t('前饋撐不住：kG 不準，或靜摩擦 kS 卡住', 'Feedforward can’t hold it: kG is off, or static friction kS is sticking'), next: t('修 kG（回授一直偏同一邊）、補 kS；不要急著加 kI', 'Fix kG (feedback always leaning one way) and add kS; don’t rush to add kI') },
  following: { cause: t('前饋沒跟上軌跡：kV、kA 不準，或輸出飽和', 'Feedforward isn’t keeping up with the profile: kV or kA is off, or the output is saturated'), next: t('先確認沒飽和，再修 kV（等速段）、kA（加減速段）', 'First make sure it isn’t saturated, then fix kV (cruise sections) and kA (accel/decel sections)') },
  saturation: { cause: t('物理限制：馬達已經全力，軌跡要的比電池給得起的多', 'Physical limit: the motor is at full effort and the profile asks for more than the battery can give'), next: t('降低 Motion Magic 速度或加速度，調 PID 沒用', 'Lower the Motion Magic velocity or acceleration; tuning PID won’t help') },
  ripple: { cause: t('到位後電壓抖：振盪（kP 太大、控制週期長、延遲）或 kD 放大雜訊', 'Voltage jitters after arrival: oscillation (kP too big, long control period, delay) or kD amplifying noise'), next: t('位置也在抖就降 kP；位置不動只有電壓抖就降 kD', 'If the position is jittering too, lower kP; if only the voltage jitters and the position is still, lower kD') },
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
    settling: [m.settlingTime === null ? t('沒穩定', 'not settled') : `${m.settlingTime.toFixed(2)} s`, `${spec.settling} s`],
    steadyState: [cm(m.steadyStateError), cm(spec.steadyState)],
    following: [cm(m.maxFollowingError), cm(spec.following)],
    saturation: [`${(m.saturationFraction * 100).toFixed(1)}%`, `${(spec.saturation * 100).toFixed(1)}%`],
    ripple: [`${m.holdVoltageRipple.toFixed(2)} V`, `${spec.ripple} V`],
  }
  return moveFailures(m, spec).map((key) => ({ key, label: SPEC_LABEL[key], actual: fmt[key][0], limit: fmt[key][1], ...SPEC_ADVICE[key] }))
}
