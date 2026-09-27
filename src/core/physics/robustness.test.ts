import { describe, expect, it } from 'vitest'
import { computeFeedforward } from '../feedforward'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { plantFromMechanism } from './elevator'
import { applySample, DEFAULT_RANGES, runRobustness, sampleRanges } from './robustness'
import type { SimInput } from './simulate'
import { DEFAULT_SPEC, moveFailures, passesSpec } from './spec'

const m = DEFAULT_MECHANISM
const ff = computeFeedforward(m)
const base = (kP = 50): SimInput => ({
  plant: plantFromMechanism(m, ff, { realistic: true }),
  gains: { kS: 0.15, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP, kI: 0, kD: 0 },
  motionMagic: { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration },
  controlPeriod: 0.001,
  initialPosition: 0.12,
  moves: [
    { time: 0.3, goal: 0.9 },
    { time: 2.3, goal: 0.12 },
  ],
  duration: 4.3,
})

describe('穩健性測試（步驟 10）', () => {
  it('抽樣落在範圍內，而且同一個 seed 結果一樣', () => {
    const s = sampleRanges({ ...DEFAULT_RANGES, runs: 50 })
    expect(s).toHaveLength(50)
    for (const x of s) {
      expect(x.massScale).toBeGreaterThanOrEqual(0.8)
      expect(x.massScale).toBeLessThanOrEqual(1.2)
      expect(x.battery).toBeGreaterThanOrEqual(11.5)
      expect(x.friction).toBeLessThanOrEqual(0.35)
    }
    expect(sampleRanges({ ...DEFAULT_RANGES, runs: 5 })).toEqual(sampleRanges({ ...DEFAULT_RANGES, runs: 5 }))
  })

  it('質量變重：kG、kA 一起變大，kV 不變', () => {
    const p = applySample(base(), m, ff, { massScale: 1.2, battery: 12, friction: 0.1 })
    expect(p.plant.kG).toBeGreaterThan(base().plant.kG * 1.15)
    expect(p.plant.kA).toBeCloseTo(base().plant.kA * 1.2, 6)
    expect(p.plant.kV).toBe(base().plant.kV)
    expect(p.plant.batteryVoltage).toBe(12)
  })

  it('kP 大一點比較穩健：通過率比 kP 很小時高', () => {
    const ranges = { ...DEFAULT_RANGES, runs: 20 }
    const weak = runRobustness(base(5), m, ff, ranges)
    const strong = runRobustness(base(150), m, ff, ranges)
    expect(strong.passRate).toBeGreaterThan(weak.passRate)
    expect(weak.runs[weak.worstIndex].pass).toBe(false)
    expect(weak.worst.moves).toHaveLength(2)
  })

  it('幾十次模擬在幾秒內跑完（完成標準）', () => {
    const t0 = performance.now()
    runRobustness(base(), m, ff, { ...DEFAULT_RANGES, runs: 40 })
    expect(performance.now() - t0).toBeLessThan(5000)
  })

  it('規格判斷', () => {
    const ok = { goal: 1, profileDuration: 1, overshoot: 0, settlingTime: 0.1, steadyStateError: 0, maxFollowingError: 0.01, peakStatorCurrent: 30, saturationFraction: 0, currentLimitFraction: 0, slot: 0 as const, holdVoltageRipple: 0 }
    expect(passesSpec([ok])).toBe(true)
    expect(moveFailures({ ...ok, settlingTime: null, overshoot: 0.02 }, DEFAULT_SPEC)).toEqual(['overshoot', 'settling'])
  })
})
