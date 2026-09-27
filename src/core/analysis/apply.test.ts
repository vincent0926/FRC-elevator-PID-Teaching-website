import { describe, expect, it } from 'vitest'
import { DEFAULT_MECHANISM, ParameterSetSchema } from '../../schema/parameterSet'
import { applyChange, gainsOf, paramsFromGains } from './apply'

const g = { kS: 0.1, kG: 0.5, kV: 5, kA: 0.08, kP: 50, kI: 0, kD: 0 }
const base = paramsFromGains(DEFAULT_MECHANISM, g, { cruiseVelocity: 1.5, acceleration: 10 }, 'measured')

describe('applyChange', () => {
  it('只改一個參數，其他照舊，來源變成調參建議值', () => {
    const next = applyChange(base, { kind: 'gain', param: 'kG', from: 0.5, to: 0.62 })
    expect(next.source).toBe('tuning')
    expect(next.feedforward.kG).toBe(0.62)
    expect(gainsOf(next)).toEqual({ ...g, kG: 0.62 })
    expect(base.feedforward.kG).toBe(0.5)
    expect(ParameterSetSchema.safeParse(next).success).toBe(true)
  })

  it('回授參數改在 feedback', () => {
    expect(applyChange(base, { kind: 'gain', param: 'kP', from: 50, to: 30 }).feedback.kP).toBe(30)
  })

  it('物理限制改 Motion Magic', () => {
    const next = applyChange(base, { kind: 'motionMagic', cruiseVelocity: { from: 1.5, to: 1.2 }, acceleration: { from: 10, to: 8 } })
    expect(next.motionMagic).toEqual({ cruiseVelocity: 1.2, acceleration: 8 })
    expect(next.feedforward).toEqual(base.feedforward)
  })
})
