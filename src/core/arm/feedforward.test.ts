import { describe, expect, it } from 'vitest'
import { armGravityTorque, armInertia, computeArmFeedforward, kPFromVoltsPerDeg } from './feedforward'
import { motorModel } from '../motors'
import { GRAVITY } from '../units'
import { DEFAULT_ARM, DEG } from '../../schema/armParameterSet'

describe('手臂前饋', () => {
  it('重力力矩與慣量照公式', () => {
    const m = DEFAULT_ARM
    expect(armGravityTorque(m)).toBeCloseTo(GRAVITY * (4 * 0.3 + 1 * 0.6))
    expect(armInertia(m)).toBeCloseTo(4 * (0.36 / 12 + 0.09) + 1 * 0.36)
  })
  it('kG、kV、kA 照公式；kV 跟質量無關，kG 跟齒比成反比', () => {
    const { R, kT, Kv } = motorModel('krakenX60')
    const ff = computeArmFeedforward(DEFAULT_ARM)
    expect(ff.kG).toBeCloseTo((armGravityTorque(DEFAULT_ARM) / 60) * (R / (1 * kT)))
    expect(ff.kV).toBeCloseTo(60 / Kv)
    expect(ff.kA).toBeCloseTo((armInertia(DEFAULT_ARM) * R) / (60 * 1 * kT))
    const heavy = computeArmFeedforward({ ...DEFAULT_ARM, payloadMass: 3 })
    expect(heavy.kV).toBeCloseTo(ff.kV)
    const g2 = computeArmFeedforward({ ...DEFAULT_ARM, gearRatio: 120 })
    expect(g2.kG).toBeCloseTo(ff.kG / 2)
  })
  it('最高角速度扣掉 kS；kS 沒量時等於不含摩擦的上限', () => {
    const a = computeArmFeedforward(DEFAULT_ARM)
    expect(a.frictionIncluded).toBe(false)
    expect(a.maxVelocity).toBeCloseTo(a.maxVelocityNoFriction)
    const b = computeArmFeedforward({ ...DEFAULT_ARM, measuredKs: 0.3 })
    expect(b.maxVelocity).toBeCloseTo((11 - b.kG - 0.3) / b.kV)
    expect(b.maxAccelUp).toBeLessThan(a.maxAccelUp)
  })
  it('角度範圍反了會警告；kP 從「每度幾伏特」換成 V/rad', () => {
    const w = computeArmFeedforward({ ...DEFAULT_ARM, minAngle: 90 * DEG, maxAngle: 0 })
    expect(w.warnings.some((x) => x.includes('最大角度'))).toBe(true)
    expect(kPFromVoltsPerDeg(1)).toBeCloseTo(57.2958, 3)
  })
})
