import { describe, expect, it } from 'vitest'
import { Slot0Controller, type AntiWindupMode } from './slot0'

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

describe('積分防飽和', () => {
  const gains = { kS: 0, kG: 0, kV: 0, kA: 0, kP: 5, kI: 50, kD: 0 }
  const ref = { pos: 1, vel: 0, acc: 0 }
  const meas = { pos: 0, vel: 0 }
  // 誤差 1 m：P 給 5 V，積分 0.14 s 後就頂到 12 V，跑 1 秒
  const integralAfter = (mode: AntiWindupMode) => {
    const c = new Slot0Controller({ ...gains }, 12, { mode, iZone: 0.1 })
    let out = c.calculate(ref, meas, 0.01)
    for (let i = 0; i < 99; i++) out = c.calculate(ref, meas, 0.01)
    return out.integral
  }
  it('沒有防飽和：輸出早就飽和，積分還是一直長', () => {
    expect(integralAfter('none')).toBeCloseTo(50 * 1, 5)
  })
  it('條件積分：頂到 12 V 後不再積分，積分停在剛好補滿的地方', () => {
    const i = integralAfter('clamp')
    expect(i).toBeGreaterThan(6.5)
    expect(i).toBeLessThan(7.6)
  })
  it('I-Zone：誤差超過範圍時積分是 0', () => {
    expect(integralAfter('izone')).toBe(0)
  })
  it('反算：積分被拉回到「剛好飽和」附近，比沒有防飽和小很多', () => {
    // 穩態時 raw − 12 = e·kI·tracking = 2.5 V，所以積分停在 12 + 2.5 − 5 ≈ 9.5 V 附近（沒有防飽和是 50 V）
    const i = integralAfter('backCalc')
    expect(i).toBeLessThan(10)
    expect(i).toBeGreaterThan(6)
  })
  it('沒飽和時四種做法一樣', () => {
    const small = { pos: 0.001, vel: 0, acc: 0 }
    const outs = (['none', 'clamp', 'izone', 'backCalc'] as const).map((mode) => {
      const c = new Slot0Controller({ ...gains }, 12, { mode, iZone: 0.1 })
      let o = c.calculate(small, meas, 0.01)
      for (let i = 0; i < 9; i++) o = c.calculate(small, meas, 0.01)
      return o.integral
    })
    for (const o of outs) expect(o).toBeCloseTo(outs[0], 9)
  })
})
