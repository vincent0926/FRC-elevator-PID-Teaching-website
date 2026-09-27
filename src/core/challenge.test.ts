import { describe, expect, it } from 'vitest'
import { computeFeedforward } from './feedforward'
import { plantFromMechanism } from './physics/elevator'
import { simulate } from './physics/simulate'
import { passesSpec } from './physics/spec'
import { DEFAULT_MECHANISM } from '../schema/parameterSet'
import { makeChallenge, nextStatus, referenceSolution, type HiddenPlant } from './challenge'

const m = DEFAULT_MECHANISM
const ff = computeFeedforward(m)

describe('挑戰模式（步驟 8）', () => {
  it('同一個 seed 產生同一台電梯；重量一定跟理論差 30% 以上', () => {
    expect(makeChallenge(7, 'hard')).toEqual(makeChallenge(7, 'hard'))
    for (let s = 0; s < 50; s++) {
      const h = makeChallenge(s, 'easy')
      expect(Math.abs(h.kGScale - 1)).toBeGreaterThanOrEqual(0.3)
      expect(h.kVScale).toBe(1)
      expect(h.frictionUp).toBe(h.frictionDown)
    }
  })

  it('判斷勝負', () => {
    expect(nextStatus(true, 3, 8)).toBe('won')
    expect(nextStatus(false, 3, 8)).toBe('playing')
    expect(nextStatus(false, 8, 8)).toBe('lost')
    expect(nextStatus(true, 8, 8)).toBe('won')
  })

  const input = (h: HiddenPlant, g: { kS: number; kG: number; kV: number; kA: number; kP: number }, mmScale: number) => ({
    plant: plantFromMechanism(m, ff, { realistic: true, kGScale: h.kGScale, kVScale: h.kVScale, kAScale: h.kAScale, frictionKs: h.frictionUp, frictionKsDown: h.frictionDown }),
    gains: { ...g, kI: 0, kD: 0 },
    motionMagic: { cruiseVelocity: ff.cruiseVelocity * mmScale, acceleration: ff.acceleration * mmScale },
    controlPeriod: 0.001,
    initialPosition: 0.12,
    moves: [
      { time: 0.5, goal: 0.9 },
      { time: 4, goal: 0.12 },
    ],
    duration: 7.5,
  })
  // 理論值：kP 0.5 V/cm、沒有 kS
  const theoryPasses = (h: HiddenPlant) => passesSpec(simulate(input(h, { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP: 50 }, 1)).moves)
  const solutionPasses = (h: HiddenPlant) => {
    const s = referenceSolution(h, ff)
    return passesSpec(simulate(input(h, s, s.motionMagicScale)).moves)
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i：理論值過不了，參考解答能過（有解）', (seed) => {
    for (const level of ['easy', 'hard'] as const) {
      const h = makeChallenge(seed, level, (x) => theoryPasses(x) || !solutionPasses(x))
      expect(theoryPasses(h)).toBe(false)
      expect(solutionPasses(h)).toBe(true)
    }
  })
})
