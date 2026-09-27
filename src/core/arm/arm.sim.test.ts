import { describe, expect, it } from 'vitest'
import { computeArmFeedforward, kPFromVoltsPerDeg } from './feedforward'
import { plantFromArm } from './plant'
import { acceleration } from '../physics/elevator'
import { simulate, type SimInput } from '../physics/simulate'
import { DEFAULT_ARM, DEG } from '../../schema/armParameterSet'

const m = DEFAULT_ARM
const ff = computeArmFeedforward(m)
const gains = { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP: kPFromVoltsPerDeg(0.5), kI: 0, kD: 0 }
const input = (patch: Partial<SimInput> = {}): SimInput => ({
  plant: plantFromArm(m, ff, { realistic: false }),
  gains,
  motionMagic: { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration },
  controlPeriod: 0.001,
  initialPosition: 0,
  moves: [{ time: 0.3, goal: 80 * DEG }],
  duration: 3,
  tolerance: 1 * DEG,
  gravityType: 'armCosine',
  ...patch,
})

describe('手臂受控體', () => {
  it('給 kG·cos θ 剛好撐住：水平、60° 都不動；直立時不用出力', () => {
    const p = plantFromArm(m, ff, { realistic: false })
    for (const deg of [0, 60, -15]) {
      const th = deg * DEG
      expect(acceleration(p, { pos: th, vel: 0 }, ff.kG * Math.cos(th))).toBeCloseTo(0, 9)
    }
    expect(acceleration(p, { pos: 90 * DEG, vel: 0 }, 0)).toBeCloseTo(0, 9)
  })
  it('理論值（Arm_Cosine）跟得上軌跡、停得準', () => {
    const r = simulate(input())
    expect(r.moves[0].maxFollowingError).toBeLessThan(1 * DEG)
    expect(r.moves[0].steadyStateError).toBeLessThan(0.2 * DEG)
  })
  it('把手臂當電梯（常數 kG）：到高角度時 kG 給太多，停在目標上面', () => {
    const r = simulate(input({ gravityType: 'constant' }))
    const cosCase = simulate(input())
    expect(r.moves[0].steadyStateError).toBeGreaterThan(cosCase.moves[0].steadyStateError * 5)
    // 最後停的位置比目標高（多出來的 kG·(1 − cos 80°) 往上推）
    expect(r.pos[r.pos.length - 1]).toBeGreaterThan(80 * DEG)
  })
  it('撞到角度上下限就停', () => {
    const r = simulate(input({ moves: [{ time: 0.1, goal: 150 * DEG }], motionMagic: { cruiseVelocity: 3, acceleration: 10 } }))
    expect(Math.max(...r.pos)).toBeLessThanOrEqual(m.maxAngle + 1e-9)
  })
})
