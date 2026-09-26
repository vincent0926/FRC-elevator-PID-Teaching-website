import { describe, expect, it } from 'vitest'
import { trapezoidProfile } from './profile'

describe('trapezoidProfile', () => {
  it('夠長時是梯形：到達巡航速度，時間符合公式', () => {
    const p = trapezoidProfile(0, 1, 2, 8)
    // 加速 0.25 s、加速距離 0.25 m，等速 0.5 m / 2 = 0.25 s
    expect(p.accelTime).toBeCloseTo(0.25)
    expect(p.cruiseTime).toBeCloseTo(0.25)
    expect(p.duration).toBeCloseTo(0.75)
    expect(p.peakVelocity).toBe(2)
    expect(p.sample(0.4).vel).toBeCloseTo(2)
    expect(p.sample(p.duration).pos).toBeCloseTo(1)
  })

  it('太短時退化成三角形', () => {
    const p = trapezoidProfile(0, 0.1, 5, 10)
    expect(p.cruiseTime).toBe(0)
    expect(p.peakVelocity).toBeCloseTo(Math.sqrt(0.1 * 10))
    expect(p.sample(p.duration + 1).pos).toBeCloseTo(0.1)
  })

  it('往下移動：速度為負，位置連續', () => {
    const p = trapezoidProfile(1, 0.2, 1.5, 6)
    let prev = p.sample(0).pos
    for (let t = 0.001; t <= p.duration + 0.1; t += 0.001) {
      const s = p.sample(t)
      expect(s.vel).toBeLessThanOrEqual(1e-12)
      expect(Math.abs(s.pos - prev)).toBeLessThan(1.5 * 0.001 + 1e-9)
      prev = s.pos
    }
    expect(prev).toBeCloseTo(0.2)
  })

  it('速度是位置的微分', () => {
    const p = trapezoidProfile(0.1, 0.9, 1.2, 5)
    for (const t of [0.05, 0.3, 0.6, p.duration - 0.05]) {
      const h = 1e-5
      const numeric = (p.sample(t + h).pos - p.sample(t - h).pos) / (2 * h)
      expect(numeric).toBeCloseTo(p.sample(t).vel, 4)
    }
  })

  it('非正的限制會丟錯', () => {
    expect(() => trapezoidProfile(0, 1, 0, 1)).toThrow()
  })
})
