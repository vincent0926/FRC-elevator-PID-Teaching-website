import { describe, expect, it } from 'vitest'
import { stepRK4, type PlantParams } from './elevator'
import { simulate } from './simulate'
import { computeFeedforward } from '../feedforward'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { plantFromMechanism } from './elevator'

const ff = computeFeedforward(DEFAULT_MECHANISM)

const ideal: PlantParams = {
  kG: ff.kG,
  kV: ff.kV,
  kA: ff.kA,
  frictionKs: 0,
  motorResistance: ff.motorResistance,
  motorCount: 2,
  statorCurrentLimit: null,
  batteryVoltage: 12,
  batteryResistance: 0,
  minPosition: -100,
  maxPosition: 100,
}

describe('受控體（開迴路）', () => {
  it('定電壓起步與解析解誤差 < 1%（Phase 0 標準）', () => {
    // kA·a = u − kG − kV·v → v(t) = v∞(1 − e^(−t/τ))，τ = kA/kV
    const u = 6
    const vInf = (u - ideal.kG) / ideal.kV
    const tau = ideal.kA / ideal.kV
    const exact = (t: number) => vInf * (t - tau * (1 - Math.exp(-t / tau)))
    let s = { pos: 0, vel: 0 }
    const dt = 0.001
    let worst = 0
    for (let i = 1; i <= 2000; i++) {
      s = stepRK4(ideal, s, u, dt)
      const t = i * dt
      if (t > 0.05) worst = Math.max(worst, Math.abs(s.pos - exact(t)) / exact(t))
    }
    expect(worst).toBeLessThan(0.01)
    expect(worst).toBeLessThan(1e-6) // RK4 實際上遠比 1% 準
  })

  it('給剛好 kG 會停在原地', () => {
    let s = { pos: 0.5, vel: 0 }
    for (let i = 0; i < 1000; i++) s = stepRK4(ideal, s, ideal.kG, 0.001)
    expect(s.pos).toBeCloseTo(0.5, 9)
  })

  it('靜摩擦撐得住時不會動', () => {
    const p = { ...ideal, frictionKs: 0.3 }
    let s = { pos: 0.5, vel: 0 }
    for (let i = 0; i < 1000; i++) s = stepRK4(p, s, ideal.kG + 0.2, 0.001)
    expect(s.pos).toBe(0.5)
    expect(s.vel).toBe(0)
  })

  it('撞到上限會停', () => {
    const p = { ...ideal, maxPosition: 0.2 }
    let s = { pos: 0, vel: 0 }
    for (let i = 0; i < 2000; i++) s = stepRK4(p, s, 12, 0.001)
    expect(s.pos).toBe(0.2)
    expect(s.vel).toBe(0)
  })

  it('電流限制會讓加速變慢', () => {
    const limited = { ...ideal, statorCurrentLimit: 20 }
    let a = { pos: 0, vel: 0 }
    let b = { pos: 0, vel: 0 }
    for (let i = 0; i < 100; i++) {
      a = stepRK4(ideal, a, 12, 0.001)
      b = stepRK4(limited, b, 12, 0.001)
    }
    expect(b.vel).toBeLessThan(a.vel)
  })
})

describe('閉迴路模擬', () => {
  const mm = { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration }
  const exact = { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP: 50, kI: 0, kD: 0 }

  it('參數完全正確時，前饋幾乎就能追上軌跡', () => {
    const r = simulate({ plant: ideal, gains: exact, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0.1, goal: 0.9 }], duration: 3 })
    const m = r.moves[0]
    expect(m.maxFollowingError).toBeLessThan(0.002)
    expect(m.steadyStateError).toBeLessThan(0.001)
    expect(m.settlingTime).not.toBeNull()
  })

  it('kG = 0 且 kP 很小時，會掉在目標下面', () => {
    const r = simulate({ plant: ideal, gains: { ...exact, kG: 0, kP: 5 }, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0, goal: 0.6 }], duration: 3 })
    const lastPos = r.pos[r.pos.length - 1]
    // 穩態：kP·e = kG → e = kG / kP
    expect(0.6 - lastPos).toBeCloseTo(ff.kG / 5, 2)
  })

  it('roboRIO 50 Hz 比 TalonFX 1 kHz 更容易振盪', () => {
    const gains = { ...exact, kP: 300 }
    const fast = simulate({ plant: ideal, gains, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0, goal: 0.6 }], duration: 3 })
    const slow = simulate({ plant: ideal, gains, motionMagic: mm, controlPeriod: 0.02, initialPosition: 0, moves: [{ time: 0, goal: 0.6 }], duration: 3 })
    expect(slow.moves[0].maxFollowingError).toBeGreaterThan(fast.moves[0].maxFollowingError)
  })

  it('真實模型：摩擦會產生穩態誤差或需要較長時間穩定', () => {
    const plant = plantFromMechanism(DEFAULT_MECHANISM, ff, { realistic: true, frictionKs: 0.4 })
    const r = simulate({ plant, gains: { ...exact, kP: 10 }, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0, goal: 0.6 }], duration: 3 })
    // kP·e 要大於 kS 才推得動：e ≤ kS / kP = 4 cm
    expect(r.moves[0].steadyStateError).toBeGreaterThan(0)
    expect(r.moves[0].steadyStateError).toBeLessThanOrEqual(0.4 / 10 + 1e-6)
  })

  it('多段移動分別計算指標', () => {
    const r = simulate({ plant: ideal, gains: exact, motionMagic: mm, controlPeriod: 0.001, initialPosition: 0, moves: [{ time: 0, goal: 0.8 }, { time: 2, goal: 0.2 }], duration: 4 })
    expect(r.moves).toHaveLength(2)
    expect(r.moves[1].goal).toBe(0.2)
    expect(r.moves[1].steadyStateError).toBeLessThan(0.001)
  })
})
