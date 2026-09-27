import { describe, expect, it } from 'vitest'
import { computeFeedforward } from '../feedforward'
import { sampleAlignedLog } from '../log/sampleLog'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { calibrate, fitPlantFromLog } from './calibrate'

const m = DEFAULT_MECHANISM
const ff = computeFeedforward(m)
const gains = { kS: 0.15, kG: ff.kG, kV: ff.kV, kA: ff.kA, kP: 50, kI: 0, kD: 0 }
// 加速度調低，50 Hz 日誌才抓得到夠多的加速段
const mm = { cruiseVelocity: ff.cruiseVelocity * 0.8, acceleration: ff.acceleration * 0.4 }

describe('模型校正（步驟 9）', () => {
  it('從日誌擬合出真實機構：重 20%、慣性 30%、kV 多 10%、摩擦 0.25 V', () => {
    const log = sampleAlignedLog({ mechanism: m, ff, gains, motionMagic: mm, plant: { realistic: true, kGScale: 1.2, kAScale: 1.3, kVScale: 1.1, frictionKs: 0.25 } })
    const c = calibrate(log, m, ff)!
    expect(c).not.toBeNull()
    expect(c.kGScale).toBeCloseTo(1.2, 1)
    expect(c.kVScale).toBeCloseTo(1.1, 1)
    expect(c.kAScale).toBeGreaterThan(1.1)
    expect(c.kAScale).toBeLessThan(1.5)
    expect(c.friction).toBeGreaterThan(0.18)
    expect(c.friction).toBeLessThan(0.32)
    // 校正後重播比理論模型準很多，而且在門檻內
    expect(c.calibrated.rms).toBeLessThan(c.theory.rms / 3)
    expect(c.ok).toBe(true)
    expect(c.problems).toEqual([])
  })

  it('機構跟理論一樣時，倍率接近 1', () => {
    const log = sampleAlignedLog({ mechanism: m, ff, gains, motionMagic: mm, plant: { realistic: true, frictionKs: 0.15 } })
    const c = calibrate(log, m, ff)!
    expect(c.kGScale).toBeCloseTo(1, 1)
    expect(c.kVScale).toBeCloseTo(1, 1)
    expect(c.ok).toBe(true)
  })

  it('沒有移動的日誌：擬合不出來', () => {
    const log = sampleAlignedLog({ mechanism: m, ff, gains, motionMagic: mm, moves: [], duration: 3 })
    expect(fitPlantFromLog(log)).toBeNull()
  })
})
