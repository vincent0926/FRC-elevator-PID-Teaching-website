import { describe, expect, it } from 'vitest'
import { ratioPoint, sweepRatios, trapezoidTime } from './ratioSweep'
import { DEFAULT_MECHANISM } from '../schema/parameterSet'

describe('梯形軌跡時間', () => {
  it('到得了巡航速度：d/v + v/a', () => {
    expect(trapezoidTime(2, 1, 4)).toBeCloseTo(2 / 1 + 1 / 4)
  })
  it('到不了巡航速度：三角形 2√(d/a)', () => {
    expect(trapezoidTime(0.1, 5, 2)).toBeCloseTo(2 * Math.sqrt(0.05))
  })
  it('動不了是 Infinity', () => {
    expect(trapezoidTime(1, 0, 2)).toBe(Infinity)
  })
})

describe('齒比掃描', () => {
  it('齒比越大，停在半空的電流越小（kG 與齒比成反比）', () => {
    const a = ratioPoint(DEFAULT_MECHANISM, 5)
    const b = ratioPoint(DEFAULT_MECHANISM, 10)
    expect(b.holdCurrent).toBeCloseTo(a.holdCurrent / 2)
  })
  it('有一個最快的齒比，而且在掃描範圍中間（太小加速不起來、太大速度不夠）', () => {
    const { points, fastest } = sweepRatios(DEFAULT_MECHANISM)
    expect(fastest).not.toBeNull()
    expect(fastest!.ratio).toBeGreaterThan(points[0].ratio)
    expect(fastest!.ratio).toBeLessThan(points[points.length - 1].ratio)
    // 跟目前的齒比算出來的一致
    const here = ratioPoint(DEFAULT_MECHANISM, DEFAULT_MECHANISM.gearRatio)
    expect(here.travelTime).toBeGreaterThanOrEqual(fastest!.travelTime - 1e-9)
  })
})
