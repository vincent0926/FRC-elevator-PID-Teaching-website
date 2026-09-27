import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEC, SPEC_PRESETS, describeSpec, diagnoseMove, isSpec, moveFailures } from './spec'
import type { MoveMetrics } from './simulate'

const move = (o: Partial<MoveMetrics>): MoveMetrics =>
  ({ overshoot: 0, settlingTime: 0.1, steadyStateError: 0, maxFollowingError: 0, saturationFraction: 0, holdVoltageRipple: 0, ...o }) as MoveMetrics

describe('達標標準', () => {
  it('每個預設標準都是合法的 Spec', () => {
    for (const p of SPEC_PRESETS) expect(isSpec(p.spec)).toBe(true)
  })
  it('isSpec 擋掉缺值、0、負數、非數字', () => {
    expect(isSpec(null)).toBe(false)
    expect(isSpec({ ...DEFAULT_SPEC, ripple: undefined })).toBe(false)
    expect(isSpec({ ...DEFAULT_SPEC, overshoot: 0 })).toBe(false)
    expect(isSpec({ ...DEFAULT_SPEC, settling: -1 })).toBe(false)
    expect(isSpec({ ...DEFAULT_SPEC, following: NaN })).toBe(false)
  })
  it('同一次移動，放寬標準就會過', () => {
    const m = move({ overshoot: 0.02, steadyStateError: 0.02 })
    expect(moveFailures(m, DEFAULT_SPEC)).toEqual(['overshoot', 'steadyState'])
    const fast = SPEC_PRESETS.find((p) => p.id === 'fast')!.spec
    expect(moveFailures(m, fast)).toEqual([])
  })
  it('說明文字用公分', () => {
    expect(describeSpec(DEFAULT_SPEC)).toContain('超調 ≤ 1 cm')
  })
})

describe('逐次移動的診斷', () => {
  it('每一個沒過的項目都有數值、門檻、原因、建議', () => {
    const m = move({ overshoot: 0.02, settlingTime: null, saturationFraction: 0.1 })
    const d = diagnoseMove(m, DEFAULT_SPEC)
    expect(d.map((x) => x.key)).toEqual(['overshoot', 'settling', 'saturation'])
    expect(d[0].actual).toBe('2.0 cm')
    expect(d[1].actual).toBe('沒穩定')
    for (const x of d) {
      expect(x.cause.length).toBeGreaterThan(5)
      expect(x.next.length).toBeGreaterThan(5)
    }
  })
  it('都過就沒有診斷', () => {
    expect(diagnoseMove(move({}), DEFAULT_SPEC)).toEqual([])
  })
})
