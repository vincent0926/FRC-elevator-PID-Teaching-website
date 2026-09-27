import { motorModel } from '../motors'
import { GRAVITY } from '../units'
import type { ArmMechanism } from '../../schema/armParameterSet'

/**
 * 單關節手臂的前饋理論值。座標是手臂角度 θ（rad），0 = 水平、往上為正。
 *
 *   V = kS·sgn(ω) + kG·cos θ + kV·ω + kA·α      （WPILib ArmFeedforward 的形式）
 *
 *   τ_g = g·(m_arm·r_cg + m_p·d_p)     水平時重力對轉軸的力矩（N·m）
 *   kG  = τ_g / G · R / (n·kT)          水平時撐住手臂要的電壓
 *   kV  = G / Kv                        每 1 rad/s 要多少伏特抵反電動勢
 *   kA  = J · R / (G·n·kT)              每 1 rad/s² 要多少伏特
 *   J   = m_arm·(L²/12 + r_cg²) + m_p·d_p²   （桿子繞重心的慣量 + 平行軸定理，負載當成質點）
 *
 * 重力乘 cos θ：水平時力臂最長（cos 0 = 1），直立時重力通過轉軸（cos 90° = 0），過了直立會往另一邊倒（cos 變負）。
 */

export interface ArmFeedforwardResult {
  kG: number
  kV: number
  kA: number
  /** 上機量到的 kS；0 表示還沒量 */
  kS: number
  /** 水平時的重力力矩（N·m） */
  gravityTorque: number
  /** 轉動慣量（kg·m²） */
  inertia: number
  /** 最高角速度（rad/s），用最吃力的水平位置算：(V − kG − kS) / kV */
  maxVelocity: number
  maxVelocityNoFriction: number
  /** 水平往上的最大角加速度（rad/s²）：電流限制和電壓限制較小者，都扣掉 kS */
  maxAccelUp: number
  frictionIncluded: boolean
  /** Motion Magic 建議值（上限的 75%） */
  cruiseVelocity: number
  acceleration: number
  motorResistance: number
  warnings: string[]
}

export const ARM_PROFILE_SAFETY_FACTOR = 0.75

export function armInertia(m: ArmMechanism): number {
  return m.armMass * ((m.armLength * m.armLength) / 12 + m.cgDistance * m.cgDistance) + m.payloadMass * m.payloadDistance * m.payloadDistance
}

export function armGravityTorque(m: ArmMechanism): number {
  return GRAVITY * (m.armMass * m.cgDistance + m.payloadMass * m.payloadDistance)
}

export function computeArmFeedforward(m: ArmMechanism): ArmFeedforwardResult {
  const { R, kT, Kv } = motorModel(m.motor)
  const n = m.motorCount
  const G = m.gearRatio
  const tau = armGravityTorque(m)
  const J = armInertia(m)
  const kG = (tau / G) * (R / (n * kT))
  const kV = G / Kv
  const kA = Math.max(J, 1e-6) * R / (G * n * kT)
  const kS = m.measuredKs ?? 0

  const maxVelocity = (m.calcVoltage - kG - kS) / kV
  const maxVelocityNoFriction = (m.calcVoltage - kG) / kV
  const maxTorque = n * kT * m.statorCurrentLimit * G
  const frictionTorque = (kS * n * kT * G) / R
  const accelByCurrent = (maxTorque - tau - frictionTorque) / Math.max(J, 1e-6)
  const accelByVoltage = (m.calcVoltage - kG - kS) / kA
  const maxAccelUp = Math.min(accelByCurrent, accelByVoltage)

  const warnings: string[] = []
  if (m.maxAngle <= m.minAngle) warnings.push('最大角度要比最小角度大。')
  if (m.cgDistance > m.armLength) warnings.push('重心距離比手臂還長：檢查是不是把直徑當半徑、或單位填錯。')
  if (kG > m.calcVoltage * 0.5) warnings.push('kG 超過計算用電壓的一半：手臂太重或齒比不夠，水平時剩下能拿來加速的電壓很少。')
  if (!(accelByCurrent > 0)) warnings.push('電流限制給的力矩撐不住水平的手臂（加上摩擦）：提高 Stator 電流限制或加大齒比。')
  if (!(accelByVoltage > 0)) warnings.push('計算用電壓扣掉 kG 和 kS 後沒有剩，水平時抬不起來：這是電壓不夠，不是電流限制。')
  if (m.motor === 'neo') warnings.push('NEO 屬於 REV，程式輸出只支援 Phoenix 6，數字可以參考。')

  return {
    kG,
    kV,
    kA,
    kS,
    gravityTorque: tau,
    inertia: J,
    maxVelocity,
    maxVelocityNoFriction,
    maxAccelUp,
    frictionIncluded: kS > 0,
    cruiseVelocity: Math.max(0, maxVelocity * ARM_PROFILE_SAFETY_FACTOR),
    acceleration: Math.max(0, maxAccelUp * ARM_PROFILE_SAFETY_FACTOR),
    motorResistance: R,
    warnings,
  }
}

/** 入門版 kP：「誤差 1 度要給幾伏特」→ V/rad */
export function kPFromVoltsPerDeg(voltsPerDeg: number): number {
  return (voltsPerDeg * 180) / Math.PI
}
