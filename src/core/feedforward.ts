import { motorModel } from './motors'
import { GRAVITY } from './units'
import type { ElevatorMechanism, Stage } from '../schema/parameterSet'

/**
 * 電梯前饋理論值。座標為鼓輪線位移 x（第一級），單位 SI。
 *
 *   kG = (m_G · g − F_cb) · r / G · R / (n · kT)
 *   kV = G / (r · Kv)
 *   kA = m_A · r · R / (G · n · kT)
 *
 *   m_G = Σ mᵢ · kᵢ     重力等效質量（速度比一次方：虛功原理，重力做功與位移成正比）
 *   m_A = Σ mᵢ · kᵢ²    慣性等效質量（速度比平方：動能與速度平方成正比）
 *
 * 負載掛在最上層，速度比用最上層的 k。
 */

export interface EffectiveMass {
  gravity: number // m_G
  inertia: number // m_A
}

export function effectiveMass(stages: Stage[], payloadMass: number): EffectiveMass {
  const kTop = stages.length ? stages[stages.length - 1].speedRatio : 1
  let gravity = payloadMass * kTop
  let inertia = payloadMass * kTop * kTop
  for (const s of stages) {
    gravity += s.mass * s.speedRatio
    inertia += s.mass * s.speedRatio * s.speedRatio
  }
  return { gravity, inertia }
}

export interface FeedforwardResult {
  kG: number
  kV: number
  kA: number
  mass: EffectiveMass
  /** 重力扣掉配重後的淨力（N） */
  netGravityForce: number
  /** 計算電壓扣掉 kG 後能跑的最高等速（m/s） */
  maxVelocity: number
  /** Stator 電流限制下往上的最大加速度（m/s²） */
  maxAccelUp: number
  /** 建議的 Motion Magic 起始值（上限的 75%） */
  cruiseVelocity: number
  acceleration: number
  /** 每顆馬達的繞組電阻，模擬電流限制用 */
  motorResistance: number
  warnings: string[]
}

export const PROFILE_SAFETY_FACTOR = 0.75

export function computeFeedforward(m: ElevatorMechanism): FeedforwardResult {
  const motor = motorModel(m.motor)
  const { R, kT, Kv } = motor
  const n = m.motorCount
  const G = m.gearRatio
  const r = m.drumRadius
  const mass = effectiveMass(m.stages, m.payloadMass)
  const netGravityForce = mass.gravity * GRAVITY - m.counterweightForce

  const kG = ((netGravityForce * r) / G) * (R / (n * kT))
  const kV = G / (r * Kv)
  const kA = (mass.inertia * r * R) / (G * n * kT)

  const maxVelocity = (m.calcVoltage - kG) / kV
  const maxForce = (n * kT * m.statorCurrentLimit * G) / r
  // 起步時速度為 0，可用加速度受電流限制與電壓兩者中較小者限制
  const maxAccelUp = Math.min((maxForce - netGravityForce) / mass.inertia, (m.calcVoltage - kG) / kA)

  const warnings: string[] = []
  if (kG > m.calcVoltage * 0.5) warnings.push('kG 超過計算用電壓的一半：機構太重或齒比不夠，剩下能拿來加速和跑速度的電壓很少。')
  if (kG < 0) warnings.push('配重力大於重力，kG 是負的：電梯沒通電時會自己往上跑。')
  if (!(maxVelocity > 0)) warnings.push('計算用電壓扣掉 kG 後沒有剩，電梯動不了。')
  if (!(maxAccelUp > 0)) warnings.push('電流限制給的力撐不住電梯，往上加速不起來。')
  if (m.motor === 'neo') warnings.push('NEO 屬於 REV，第一版只支援 Phoenix 6 輸出，數字可以參考但不能產生程式碼。')

  return {
    kG,
    kV,
    kA,
    mass,
    netGravityForce,
    maxVelocity,
    maxAccelUp,
    cruiseVelocity: Math.max(0, maxVelocity * PROFILE_SAFETY_FACTOR),
    acceleration: Math.max(0, maxAccelUp * PROFILE_SAFETY_FACTOR),
    motorResistance: R,
    warnings,
  }
}

/** 入門版 kP：「誤差 1 公分要給幾伏特」× 100 = V/m。 */
export function kPFromVoltsPerCm(voltsPerCm: number): number {
  return voltsPerCm * 100
}
