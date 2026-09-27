import { describe, expect, it } from 'vitest'
import { computeFeedforward, effectiveMass, kPFromVoltsPerCm } from './feedforward'
import { motorModel } from './motors'
import { DEFAULT_MECHANISM, type ElevatorMechanism } from '../schema/parameterSet'
import { GRAVITY } from './units'

describe('effectiveMass', () => {
  it('串級式：重力用速度比一次方、慣性用平方，負載跟最上層', () => {
    const m = effectiveMass(
      [
        { mass: 6, speedRatio: 1 },
        { mass: 4, speedRatio: 2 },
      ],
      1,
    )
    expect(m.gravity).toBeCloseTo(6 + 4 * 2 + 1 * 2)
    expect(m.inertia).toBeCloseTo(6 + 4 * 4 + 1 * 4)
  })

  it('單級時兩者相同，等於直接相加', () => {
    const m = effectiveMass([{ mass: 8, speedRatio: 1 }], 2)
    expect(m.gravity).toBe(10)
    expect(m.inertia).toBe(10)
  })
})

describe('computeFeedforward', () => {
  const single: ElevatorMechanism = {
    ...DEFAULT_MECHANISM,
    motor: 'krakenX60',
    motorCount: 1,
    gearRatio: 10,
    drumRadius: 0.02,
    stages: [{ mass: 5, speedRatio: 1 }],
    payloadMass: 0,
  }

  it('與手算一致', () => {
    const mm = motorModel('krakenX60')
    const ff = computeFeedforward(single)
    // kG = m g r / G · R / kT
    expect(ff.kG).toBeCloseTo(((5 * GRAVITY * 0.02) / 10) * (mm.R / mm.kT), 10)
    expect(ff.kV).toBeCloseTo(10 / (0.02 * mm.Kv), 10)
    expect(ff.kA).toBeCloseTo((5 * 0.02 * mm.R) / (10 * mm.kT), 10)
    // 大約值（Kraken X60，WPILib 常數）：kG ≈ 0.166 V、kV ≈ 9.50 V/(m/s)
    expect(ff.kG).toBeCloseTo(0.166, 3)
    expect(ff.kV).toBeCloseTo(9.497, 2)
  })

  it('馬達數量加倍，kG、kA 減半，kV 不變', () => {
    const one = computeFeedforward(single)
    const two = computeFeedforward({ ...single, motorCount: 2 })
    expect(two.kG).toBeCloseTo(one.kG / 2, 10)
    expect(two.kA).toBeCloseTo(one.kA / 2, 10)
    expect(two.kV).toBeCloseTo(one.kV, 10)
  })

  it('配重力抵銷 kG', () => {
    const ff = computeFeedforward({ ...single, counterweightForce: 5 * GRAVITY })
    expect(Math.abs(ff.kG)).toBeLessThan(1e-12)
  })

  it('串級式若直接相加質量，kG、kA 都會算錯', () => {
    const ff = computeFeedforward(DEFAULT_MECHANISM)
    const naive = computeFeedforward({ ...DEFAULT_MECHANISM, stages: [{ mass: 11, speedRatio: 1 }], payloadMass: 0 })
    expect(ff.kG / naive.kG).toBeCloseTo(16 / 11, 6)
    expect(ff.kA / naive.kA).toBeCloseTo(26 / 11, 6)
  })

  it('太重時會警告', () => {
    const ff = computeFeedforward({ ...single, stages: [{ mass: 200, speedRatio: 1 }] })
    expect(ff.warnings.length).toBeGreaterThan(0)
  })

  it('起始巡航速度與加速度是上限的 75%', () => {
    const ff = computeFeedforward(DEFAULT_MECHANISM)
    expect(ff.cruiseVelocity).toBeCloseTo(ff.maxVelocity * 0.75)
    expect(ff.acceleration).toBeCloseTo(ff.maxAccelUp * 0.75)
  })

  it('kP 入門公式', () => {
    expect(kPFromVoltsPerCm(0.5)).toBe(50)
  })
})

describe('最高速度、加速度要扣掉 kS', () => {
  it('v_max = (V − kG − kS) / kV；kS = 0 時跟不含摩擦的一樣', () => {
    const base = computeFeedforward(DEFAULT_MECHANISM)
    expect(base.frictionIncluded).toBe(false)
    expect(base.maxVelocity).toBeCloseTo(base.maxVelocityNoFriction)
    const withKs = computeFeedforward({ ...DEFAULT_MECHANISM, measuredKs: 0.5 })
    expect(withKs.frictionIncluded).toBe(true)
    expect(withKs.maxVelocity).toBeCloseTo((DEFAULT_MECHANISM.calcVoltage - withKs.kG - 0.5) / withKs.kV)
    expect(withKs.maxVelocity).toBeLessThan(base.maxVelocity)
    expect(withKs.maxAccelUp).toBeLessThan(base.maxAccelUp)
    expect(withKs.cruiseVelocity).toBeLessThan(base.cruiseVelocity)
    // kG、kV、kA 跟摩擦無關
    expect(withKs.kG).toBeCloseTo(base.kG)
  })
  it('加速不起來時分清楚是電壓不夠還是電流限制', () => {
    const lowV = computeFeedforward({ ...DEFAULT_MECHANISM, measuredKs: 0.5, calcVoltage: 0.6 })
    expect(lowV.warnings.some((w) => w.includes('電壓不夠'))).toBe(true)
    expect(lowV.warnings.some((w) => w.includes('電流限制給的力'))).toBe(false)
    const lowI = computeFeedforward({ ...DEFAULT_MECHANISM, statorCurrentLimit: 1 })
    expect(lowI.warnings.some((w) => w.includes('電流限制給的力'))).toBe(true)
    expect(lowI.warnings.some((w) => w.includes('電壓不夠'))).toBe(false)
  })
})
