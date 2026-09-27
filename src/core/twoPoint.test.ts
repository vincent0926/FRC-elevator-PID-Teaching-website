import { describe, expect, it } from 'vitest'
import { twoPointKsKg } from './twoPoint'

describe('兩點法量 kS、kG', () => {
  it('kG 是平均、kS 是差的一半', () => {
    const r = twoPointKsKg(0.6, 0.3)
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.kG).toBeCloseTo(0.45)
    expect(r.kS).toBeCloseTo(0.15)
    expect(r.warnings).toEqual([])
  })
  it('填反或沒填會報錯', () => {
    expect('error' in twoPointKsKg(0.3, 0.6)).toBe(true)
    expect('error' in twoPointKsKg(NaN, 0.6)).toBe(true)
  })
  it('往下要負電壓、摩擦太大時提醒', () => {
    const r = twoPointKsKg(1.5, -0.8)
    if ('error' in r) throw new Error(r.error)
    expect(r.warnings.length).toBe(2)
  })
})
