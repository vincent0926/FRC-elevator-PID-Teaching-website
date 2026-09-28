import type { ElevatorMechanism } from '../../schema/parameterSet'
import type { FeedforwardResult } from '../feedforward'

/**
 * 電梯受控體。控制輸入 u 以電壓 [V] 表示，方程式每一項都換算成「相當於多少伏特」
 * （不是說電壓是力，而是把控制輸入統一寫成電壓，讓電氣模型與機械模型直接接起來；
 *  真正的力 F = (u − kV·v)·n·kT·G/(R·r)）：
 *
 *   kA · a = u_eff − kV · v − kG − kS_friction · sgn(v)
 *
 * 推導：直流馬達 V = I·R + ω/Kv，經齒比與鼓輪換算後，反電動勢剛好是 kV·v，
 * 所以每顆馬達的 Stator 電流 I = (u − kV·v) / R。
 * 開啟電流限制時 TalonFX 會降低輸出電壓讓 |I| ≤ 上限，等效為
 *   u_eff = kV·v + clamp(I, ±I_lim) · R
 *
 * 真實模型另外加入（每一項都可以單獨開關）：庫侖摩擦（含靜摩擦卡住、往上往下不對稱）、
 * 電流限制、電池內阻壓降、齒輪箱效率、連續式換級時的 kG 跳變。
 * 齒輪箱效率 η 只打折馬達出力：η·(u_eff − kV·v)，反電動勢不變，所以穩態速度是 (V − kG/η)/kV。
 * 兩種模型都有機械上下限（撞到就停）。感測延遲與雜訊在 simulate.ts（屬於量測，不屬於受控體）。
 */

export interface PlantParams {
  kG: number
  /** 手臂：重力項是 kG·cos(位置)，位置是角度（rad，0 = 水平）。電梯不設 */
  gravityCosine?: boolean
  /** 手臂：編碼器的 0 不在水平時，真實重力是 kG·cos(位置 + offset)（教學用：零點設錯） */
  gravityCosineOffset?: number
  /** kG 隨高度變化（V/m）：拖鏈、線材重量轉移，或定力彈簧不定力。前饋的 kG 是常數，這部分只能靠回授 */
  kGSlope?: number
  /** kGSlope 的基準高度（這裡 kG 剛好等於 kG） */
  kGRefPosition?: number
  kV: number
  kA: number
  /** 真實庫侖摩擦（V），往上移動時；理想模型為 0 */
  frictionKs: number
  /** 往下移動時的摩擦（V）；沒給就跟往上一樣 */
  frictionKsDown?: number
  /** 齒輪箱效率（0–1），預設 1 */
  gearboxEfficiency?: number
  /** 連續式換級：位置超過 position 後 kG 多 delta（V） */
  kGStep?: { position: number; delta: number }
  motorResistance: number
  motorCount: number
  /** 每顆馬達 Stator 電流上限（A）；null 表示不限制 */
  statorCurrentLimit: number | null
  /** 每顆馬達 Supply（電池端）電流上限（A）；TalonFX 才有，沒給表示不限制 */
  supplyCurrentLimit?: number | null
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
  /** 往下的摩擦（V）；沒給就跟 frictionKs 一樣 */
  frictionKsDown?: number
  /** 單獨開關（沒給就跟著 realistic） */
  currentLimit?: boolean
  batterySag?: boolean
  gearboxEfficiency?: number
  /** 連續式換級時 kG 跳多少（V），在行程一半換級 */
  kGStepDelta?: number
  /** Stator 電流上限（A），沒給就用機構資料的值 */
  statorCurrentLimit?: number
  /** Supply 電流上限（A），null 或沒給表示不限制 */
  supplyCurrentLimit?: number | null
}

export function plantFromMechanism(m: ElevatorMechanism, ff: FeedforwardResult, opt: PlantOptions): PlantParams {
  return {
    kG: ff.kG * (opt.kGScale ?? 1),
    kGSlope: (opt.kGVariation ?? 0) / m.travel,
    kGRefPosition: m.travel / 2,
    kV: ff.kV * (opt.kVScale ?? 1),
    kA: ff.kA * (opt.kAScale ?? 1),
    frictionKs: opt.realistic ? (opt.frictionKs ?? 0.15) : 0,
    frictionKsDown: opt.realistic ? (opt.frictionKsDown ?? opt.frictionKs ?? 0.15) : 0,
    gearboxEfficiency: opt.realistic ? (opt.gearboxEfficiency ?? 1) : 1,
    kGStep: opt.realistic && opt.kGStepDelta ? { position: m.travel / 2, delta: opt.kGStepDelta } : undefined,
    motorResistance: ff.motorResistance,
    motorCount: m.motorCount,
    statorCurrentLimit: opt.realistic && (opt.currentLimit ?? true) ? (opt.statorCurrentLimit ?? m.statorCurrentLimit) : null,
    supplyCurrentLimit: opt.realistic ? (opt.supplyCurrentLimit ?? null) : null,
    batteryVoltage: opt.batteryVoltage ?? 12.5,
    batteryResistance: opt.realistic && (opt.batterySag ?? true) ? 0.02 : 0,
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
  /** 被 Supply 電流限制壓下來 */
  supplyLimited: boolean
}

/**
 * 控制器輸出 u 之後，馬達真正拿到的電壓與電流。
 *
 * - Stator 電流 I = (u − kV·v) / R；超過 Stator 上限時控制器降電壓，讓 |I| = 上限
 * - Supply（電池端）電流 ≈ I × u / V電池（佔空比 × Stator 電流），只在馬達出力（u 與 I 同號）時限制。
 *   限制時解 R·I² + b·I = I_sup·V電池（b 是反電動勢在出力方向的分量）
 * - coast：輸出 neutral 且設成 Coast，馬達等於斷路，電流是 0（Brake 則是短路，等於 u = 0）
 */
export function applyCurrentLimit(p: PlantParams, u: number, vel: number, coast = false): Drive {
  const backEmf = p.kV * vel
  if (coast) return { effectiveVoltage: backEmf, statorCurrent: 0, currentLimited: false, supplyLimited: false }
  const R = p.motorResistance
  let current = (u - backEmf) / R
  let limited = false
  let supplyLimited = false
  if (p.statorCurrentLimit !== null && Math.abs(current) > p.statorCurrentLimit) {
    current = Math.sign(current) * p.statorCurrentLimit
    limited = true
  }
  const lim = p.supplyCurrentLimit
  if (lim != null && lim > 0 && current !== 0) {
    const dir = Math.sign(current)
    const uEff = backEmf + current * R
    const supply = (current * uEff) / p.batteryVoltage
    if (supply > lim) {
      const b = dir * backEmf
      const a = (-b + Math.sqrt(b * b + 4 * R * lim * p.batteryVoltage)) / (2 * R)
      if (a < Math.abs(current)) {
        current = dir * a
        supplyLimited = true
      }
    }
  }
  return { effectiveVoltage: limited || supplyLimited ? backEmf + current * R : u, statorCurrent: current, currentLimited: limited, supplyLimited }
}

/** 移動方向 dir（+1 往上、−1 往下）的摩擦 */
function friction(p: PlantParams, dir: number): number {
  return dir > 0 ? p.frictionKs : (p.frictionKsDown ?? p.frictionKs)
}

const hasFriction = (p: PlantParams) => p.frictionKs > 0 || (p.frictionKsDown ?? 0) > 0

/** 重力項（含隨高度變化與換級跳變） */
export function gravity(p: PlantParams, pos: number): number {
  if (p.gravityCosine) return p.kG * Math.cos(pos + (p.gravityCosineOffset ?? 0))
  let g = p.kG + (p.kGSlope ?? 0) * (pos - (p.kGRefPosition ?? 0))
  if (p.kGStep && pos > p.kGStep.position) g += p.kGStep.delta
  return g
}

export function acceleration(p: PlantParams, s: PlantState, u: number, coast = false): number {
  const { effectiveVoltage } = applyCurrentLimit(p, u, s.vel, coast)
  let net = (p.gearboxEfficiency ?? 1) * (effectiveVoltage - p.kV * s.vel) - gravity(p, s.pos)
  if (hasFriction(p)) {
    if (Math.abs(s.vel) > STICK_VELOCITY) {
      net -= friction(p, Math.sign(s.vel)) * Math.sign(s.vel)
    } else {
      const f = friction(p, Math.sign(net))
      if (Math.abs(net) <= f) return 0 // 靜摩擦撐住
      net -= f * Math.sign(net)
    }
  }
  return net / p.kA
}

/**
 * 固定輸入電壓 u 下前進 dt（RK4），並處理機械上下限與靜摩擦。
 * 時間常數 kA/kV 比 dt 短時（齒比大、鼓輪小、機構輕）RK4 會發散成 NaN，
 * 所以自動切成小步：每小步不超過時間常數的一半。
 */
export function stepRK4(p: PlantParams, s: PlantState, u: number, dt: number, coast = false): PlantState {
  const tau = p.kA / Math.max(p.kV * (p.gearboxEfficiency ?? 1), 1e-9)
  const n = Math.min(1000, Math.max(1, Math.ceil(dt / (0.5 * tau))))
  let st = s
  for (let i = 0; i < n; i++) st = rk4Once(p, st, u, dt / n, coast)
  return st
}

function rk4Once(p: PlantParams, s: PlantState, u: number, dt: number, coast: boolean): PlantState {
  const a1 = acceleration(p, s, u, coast)
  const s2 = { pos: s.pos + 0.5 * dt * s.vel, vel: s.vel + 0.5 * dt * a1 }
  const a2 = acceleration(p, s2, u, coast)
  const s3 = { pos: s.pos + 0.5 * dt * s2.vel, vel: s.vel + 0.5 * dt * a2 }
  const a3 = acceleration(p, s3, u, coast)
  const s4 = { pos: s.pos + dt * s3.vel, vel: s.vel + dt * a3 }
  const a4 = acceleration(p, s4, u, coast)

  let pos = s.pos + (dt / 6) * (s.vel + 2 * s2.vel + 2 * s3.vel + s4.vel)
  let vel = s.vel + (dt / 6) * (a1 + 2 * a2 + 2 * a3 + a4)

  // 靜摩擦：速度穿越 0 而且力不夠大時停住
  if (hasFriction(p) && (Math.sign(vel) !== Math.sign(s.vel) || Math.abs(vel) < STICK_VELOCITY)) {
    if (acceleration(p, { pos, vel: 0 }, u, coast) === 0) vel = 0
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
