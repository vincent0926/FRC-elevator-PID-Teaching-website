import { describe, expect, it } from 'vitest'
import { adaptiveFfFit, closedLoopFilter, round3, suggestedKd } from './diagnose'
import { ols, savitzkyGolayDerivative } from './regression'

const g = { kA: 0.08, kV: 5, kP: 50, kD: 0 }

describe('closedLoopFilter', () => {
  const n = 200
  const t = Float64Array.from({ length: n }, (_, i) => i * 0.02)

  it('穩態增益是 1：前饋差 Δ，回授最後剛好補 Δ', () => {
    const y = closedLoopFilter(t, new Float64Array(n).fill(0.3), g)
    expect(y[n - 1]).toBeCloseTo(0.3, 3)
  })

  it('加減速時會落後（一開始回授還沒跟上）', () => {
    const y = closedLoopFilter(t, new Float64Array(n).fill(1), g)
    expect(y[1]).toBeLessThan(0.5)
  })

  it('未 Enable 時狀態歸零', () => {
    const y = closedLoopFilter(t, new Float64Array(n).fill(1), g, (i) => i < 100 || i > 110)
    expect(y[105]).toBe(0)
    expect(y[111]).toBeLessThan(0.5)
  })

  it('roboRIO 20 ms 零階保持比 TalonFX 1 ms 落後更多', () => {
    const x = Float64Array.from({ length: n }, (_, i) => (i > 10 ? 1 : 0))
    const fast = closedLoopFilter(t, x, g, undefined, 0.001)
    const slow = closedLoopFilter(t, x, g, undefined, 0.02)
    expect(slow[13]).toBeLessThan(fast[13])
  })
})

describe('adaptiveFfFit', () => {
  const n = 400
  const ones = new Float64Array(n).fill(1)
  const use = new Uint8Array(n).fill(1)

  it('速度有變化時四個係數都估得回來', () => {
    const v = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 20))
    const a = Float64Array.from({ length: n }, (_, i) => Math.cos(i / 20) / 20 / 0.02)
    const sgn = Float64Array.from(v, Math.sign)
    const y = Float64Array.from(v, (vi, i) => 0.1 * sgn[i] + 0.5 + 4 * vi + 0.08 * a[i])
    const r = adaptiveFfFit(y, use, { sgn, v, a, ones }, { separable: true, enoughAccel: true })!
    expect(r.ksKvCombined).toBe(false)
    expect(r.coef.kS).toBeCloseTo(0.1, 6)
    expect(r.coef.kG).toBeCloseTo(0.5, 6)
    expect(r.coef.kV).toBeCloseTo(4, 6)
    expect(r.coef.kA).toBeCloseTo(0.08, 6)
  })

  it('速度都一樣時不硬拆 kS 和 kV，改給合併值', () => {
    const v = Float64Array.from({ length: n }, (_, i) => (i % 2 ? 1.2 : -1.2))
    const a = new Float64Array(n)
    const sgn = Float64Array.from(v, Math.sign)
    const y = Float64Array.from(v, (vi, i) => 0.1 * sgn[i] + 0.5 + 4 * vi)
    const r = adaptiveFfFit(y, use, { sgn, v, a, ones }, { separable: true, enoughAccel: false })!
    expect(r.ksKvCombined).toBe(true)
    expect(r.noKa).toBe(true)
    // 合併值 = kS + kV·v
    expect(r.coef.kS).toBeCloseTo(0.1 + 4 * 1.2, 6)
    expect(r.coef.kG).toBeCloseTo(0.5, 6)
  })
})

describe('regression', () => {
  it('ols 條件數：共線欄位很大', () => {
    const n = 100
    const x1 = Float64Array.from({ length: n }, (_, i) => i)
    const x2 = Float64Array.from(x1, (v) => 2 * v + 1e-9 * Math.sin(v))
    const y = Float64Array.from(x1, (v) => v)
    const r = ols([x1, x2, new Float64Array(n).fill(1)], y, new Uint8Array(n).fill(1))
    expect(r === null || r.cond > 1e6).toBe(true)
  })

  it('Savitzky-Golay 對二次曲線的微分是準的', () => {
    const t = Float64Array.from({ length: 100 }, (_, i) => i * 0.02)
    const y = Float64Array.from(t, (x) => 3 * x * x)
    const d = savitzkyGolayDerivative(t, y, 0.12)
    expect(d[50]).toBeCloseTo(6 * t[50], 6)
    expect(Number.isNaN(d[0])).toBe(true)
  })
})

describe('小工具', () => {
  it('round3 取三位有效數字', () => {
    expect(round3(0.084051)).toBe(0.0841)
    expect(round3(49.87)).toBe(49.9)
    expect(round3(0)).toBe(0)
  })

  it('suggestedKd：阻尼比 0.7，反電動勢已經夠就是 0', () => {
    expect(suggestedKd({ kS: 0, kG: 0, kV: 0, kA: 0.1, kP: 100, kI: 0, kD: 0 })).toBeCloseTo(1.4 * Math.sqrt(10), 6)
    expect(suggestedKd({ kS: 0, kG: 0, kV: 10, kA: 0.1, kP: 100, kI: 0, kD: 0 })).toBe(0)
  })
})
