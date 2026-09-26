import { describe, expect, it } from 'vitest'
import { Slot0Controller } from './slot0'

const gains = { kS: 0.1, kG: 0.4, kV: 2, kA: 0.2, kP: 50, kI: 0, kD: 1 }

describe('Slot0Controller', () => {
  it('前饋用參考值，回授用誤差', () => {
    const c = new Slot0Controller(gains)
    const o = c.calculate({ pos: 1, vel: 0.5, acc: 2 }, { pos: 0.98, vel: 0.4 }, 0.001)
    expect(o.feedforward).toBeCloseTo(0.1 + 0.4 + 2 * 0.5 + 0.2 * 2)
    expect(o.proportional).toBeCloseTo(50 * 0.02)
    expect(o.derivative).toBeCloseTo(1 * 0.1)
    expect(o.output).toBeCloseTo(o.feedforward + o.feedback)
  })

  it('kS 跟著參考速度的正負號，靜止時不作用', () => {
    const c = new Slot0Controller(gains)
    expect(c.calculate({ pos: 0, vel: -1, acc: 0 }, { pos: 0, vel: -1 }, 0.001).feedforward).toBeCloseTo(-0.1 + 0.4 - 2)
    expect(c.calculate({ pos: 0, vel: 0, acc: 0 }, { pos: 0, vel: 0 }, 0.001).feedforward).toBeCloseTo(0.4)
  })

  it('輸出限制在峰值電壓', () => {
    const c = new Slot0Controller(gains, 12)
    const o = c.calculate({ pos: 10, vel: 0, acc: 0 }, { pos: 0, vel: 0 }, 0.001)
    expect(o.output).toBe(12)
    expect(o.saturated).toBe(true)
  })

  it('kI 會累積，reset 後歸零', () => {
    const c = new Slot0Controller({ ...gains, kP: 0, kD: 0, kI: 10 })
    for (let i = 0; i < 100; i++) c.calculate({ pos: 0.1, vel: 0, acc: 0 }, { pos: 0, vel: 0 }, 0.01)
    expect(c.calculate({ pos: 0.1, vel: 0, acc: 0 }, { pos: 0, vel: 0 }, 0.01).integral).toBeCloseTo(10 * 0.1 * 1.01)
    c.reset()
    expect(c.calculate({ pos: 0, vel: 0, acc: 0 }, { pos: 0, vel: 0 }, 0.01).integral).toBe(0)
  })
})
