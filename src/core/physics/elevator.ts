import type { ElevatorMechanism } from '../../schema/parameterSet'
import type { FeedforwardResult } from '../feedforward'

/**
 * 電梯受控體，以「伏特」為力的單位（除以 kA 就是加速度）：
 *
 *   kA · a = u_eff − kV · v − kG − kS_friction · sgn(v)
 *
 * 推導：直流馬達 V = I·R + ω/Kv，經齒比與鼓輪換算後，反電動勢剛好是 kV·v，
 * 所以每顆馬達的 Stator 電流 I = (u − kV·v) / R。
 * 開啟電流限制時 TalonFX 會降低輸出電壓讓 |I| ≤ 上限，等效為
 *   u_eff = kV·v + clamp(I, ±I_lim) · R
 *
 * 真實模型另外加入：庫侖摩擦（含靜摩擦卡住）、電流限制、電池內阻壓降。
 * 兩種模型都有機械上下限（撞到就停）。
 */

export interface PlantParams {
  kG: number
  /** kG 隨高度變化（V/m）：拖鏈、線材重量轉移，或定力彈簧不定力。前饋的 kG 是常數，這部分只能靠回授 */
  kGSlope?: number
  /** kGSlope 的基準高度（這裡 kG 剛好等於 kG） */
  kGRefPosition?: number
  kV: number
  kA: number
  /** 真實庫侖摩擦（V）；理想模型為 0 */
  frictionKs: number
  motorResistance: number
  motorCount: number
  /** 每顆馬達 Stator 電流上限（A）；null 表示不限制 */
  statorCurrentLimit: number | null
  batteryVoltage: number
  /** 電池加線路內阻（Ω）；理想模型為 0 */
  batteryResistance: number
  minPosition: number
  maxPosition: number
}

export interface PlantOptions {
  realistic: boolean
  /** 真實受控體與理論值的倍率差（教學用：故意讓機構跟理論不一樣） */
  kGScale?: number
  kVScale?: number
  kAScale?: number
  frictionKs?: number
  batteryVoltage?: number
  /** kG 在整個行程內的變化量（V，頂端比底端多多少），教學用 */
  kGVariation?: number
}

export function plantFromMechanism(m: ElevatorMechanism, ff: FeedforwardResult, opt: PlantOptions): PlantParams {
  return {
    kG: ff.kG * (opt.kGScale ?? 1),
    kGSlope: (opt.kGVariation ?? 0) / m.travel,
    kGRefPosition: m.travel / 2,
    kV: ff.kV * (opt.kVScale ?? 1),
    kA: ff.kA * (opt.kAScale ?? 1),
    frictionKs: opt.realistic ? (opt.frictionKs ?? 0.15) : 0,
    motorResistance: ff.motorResistance,
    motorCount: m.motorCount,
    statorCurrentLimit: opt.realistic ? m.statorCurrentLimit : null,
    batteryVoltage: opt.batteryVoltage ?? 12.5,
    batteryResistance: opt.realistic ? 0.02 : 0,
    minPosition: 0,
    maxPosition: m.travel,
  }
}

export interface PlantState {
  pos: number
  vel: number
}

const STICK_VELOCITY = 1e-4 // m/s，低於此速度視為靜止

export interface Drive {
  /** 限流後真正加在馬達上的電壓 */
  effectiveVoltage: number
  /** 每顆馬達 Stator 電流 */
  statorCurrent: number
  currentLimited: boolean
}

export function applyCurrentLimit(p: PlantParams, u: number, vel: number): Drive {
  const backEmf = p.kV * vel
  let current = (u - backEmf) / p.motorResistance
  let limited = false
  if (p.statorCurrentLimit !== null && Math.abs(current) > p.statorCurrentLimit) {
    current = Math.sign(current) * p.statorCurrentLimit
    limited = true
  }
  return { effectiveVoltage: limited ? backEmf + current * p.motorResistance : u, statorCurrent: current, currentLimited: limited }
}

export function acceleration(p: PlantParams, s: PlantState, u: number): number {
  const { effectiveVoltage } = applyCurrentLimit(p, u, s.vel)
  let net = effectiveVoltage - p.kV * s.vel - p.kG - (p.kGSlope ?? 0) * (s.pos - (p.kGRefPosition ?? 0))
  if (p.frictionKs > 0) {
    if (Math.abs(s.vel) > STICK_VELOCITY) {
      net -= p.frictionKs * Math.sign(s.vel)
    } else if (Math.abs(net) <= p.frictionKs) {
      return 0 // 靜摩擦撐住
    } else {
      net -= p.frictionKs * Math.sign(net)
    }
  }
  return net / p.kA
}

/** 固定輸入電壓 u 下前進 dt（RK4），並處理機械上下限與靜摩擦。 */
export function stepRK4(p: PlantParams, s: PlantState, u: number, dt: number): PlantState {
  const a1 = acceleration(p, s, u)
  const s2 = { pos: s.pos + 0.5 * dt * s.vel, vel: s.vel + 0.5 * dt * a1 }
  const a2 = acceleration(p, s2, u)
  const s3 = { pos: s.pos + 0.5 * dt * s2.vel, vel: s.vel + 0.5 * dt * a2 }
  const a3 = acceleration(p, s3, u)
  const s4 = { pos: s.pos + dt * s3.vel, vel: s.vel + dt * a3 }
  const a4 = acceleration(p, s4, u)

  let pos = s.pos + (dt / 6) * (s.vel + 2 * s2.vel + 2 * s3.vel + s4.vel)
  let vel = s.vel + (dt / 6) * (a1 + 2 * a2 + 2 * a3 + a4)

  // 靜摩擦：速度穿越 0 而且力不夠大時停住
  if (p.frictionKs > 0 && (Math.sign(vel) !== Math.sign(s.vel) || Math.abs(vel) < STICK_VELOCITY)) {
    if (acceleration(p, { pos, vel: 0 }, u) === 0) vel = 0
  }

  if (pos < p.minPosition) {
    pos = p.minPosition
    if (vel < 0) vel = 0
  } else if (pos > p.maxPosition) {
    pos = p.maxPosition
    if (vel > 0) vel = 0
  }
  return { pos, vel }
}
