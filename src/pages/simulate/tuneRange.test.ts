import { describe, expect, it } from 'vitest'
import { getGain, niceCeil, setGain, sliderRange, snap, type TuneGains } from './tuneRange'

const theory: TuneGains = {
  feedforward: { kS: 0, kG: 0.29, kV: 4.475, kA: 0.0496 },
  feedback: { kP: 50, kI: 0, kD: 0 },
  motionMagic: { cruiseVelocity: 1.79, acceleration: 20.4 },
}

describe('niceCeil', () => {
  it('取到 1、2、2.5、5 × 10ⁿ', () => {
    expect(niceCeil(0.58)).toBe(1)
    expect(niceCeil(8.95)).toBe(10)
    expect(niceCeil(200)).toBe(200)
    expect(niceCeil(201)).toBe(250)
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(NaN)).toBe(1)
  })
})

describe('sliderRange', () => {
  it('理論值落在範圍中間附近，0 到明顯太大都拉得到', () => {
    const kG = sliderRange('kG', theory, 0.29)
    expect(kG.min).toBe(0)
    expect(kG.max).toBeGreaterThanOrEqual(0.58)
    const kP = sliderRange('kP', theory, 50)
    expect(kP.max).toBe(200)
    expect(kP.step).toBeGreaterThan(0)
  })

  it('理論值是 0 的 kI、kD 用 kP 推上限', () => {
    expect(sliderRange('kI', theory, 0).max).toBe(100)
    expect(sliderRange('kD', theory, 0).max).toBeGreaterThan(0)
  })

  it('巡航速度、加速度一定大於 0', () => {
    const r = sliderRange('cruiseVelocity', theory, 1.79)
    expect(r.min).toBeGreaterThan(0)
    expect(r.max).toBeGreaterThan(1.79)
  })

  it('拉到端點時範圍不會跟著變大（手臂 kP 理論 17.2 → 上限 100）', () => {
    const arm = { ...theory, feedback: { kP: 17.2, kI: 0, kD: 0 } }
    const r = sliderRange('kP', arm, 17.2)
    expect(sliderRange('kP', arm, r.max).max).toBe(r.max)
  })

  it('目前值超出範圍時把範圍撐開', () => {
    expect(sliderRange('kP', theory, 900).max).toBeGreaterThanOrEqual(900)
  })

  it('打了超出範圍的數字之後再拉到端點，範圍不會再變大', () => {
    const r1 = sliderRange('kP', theory, 900)
    const r2 = sliderRange('kP', theory, r1.max)
    expect(r2.max).toBe(r1.max)
    expect(sliderRange('kP', theory, r2.max).max).toBe(r1.max)
  })

  it('負的 kG（配重太重）可以拉到', () => {
    const neg = { ...theory, feedforward: { ...theory.feedforward, kG: -0.3 } }
    expect(sliderRange('kG', neg, -0.3).min).toBeLessThanOrEqual(-0.6)
  })
})

describe('snap / getGain / setGain', () => {
  it('對齊步距且沒有浮點尾巴', () => {
    expect(snap(0.30000000000000004, 0.01)).toBe(0.3)
    expect(snap(51.3, 1)).toBe(51)
  })

  it('改一個欄位，其他不動', () => {
    const g = setGain(theory, 'kD', 2)
    expect(getGain(g, 'kD')).toBe(2)
    expect(g.feedback.kP).toBe(50)
    expect(getGain(setGain(theory, 'acceleration', 10), 'acceleration')).toBe(10)
    expect(setGain(theory, 'kG', 1).feedforward.kV).toBe(4.475)
  })
})
