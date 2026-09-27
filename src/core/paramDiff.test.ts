import { describe, expect, it } from 'vitest'
import { diffParams } from './paramDiff'
import { DEFAULT_MECHANISM, type ParameterSet } from '../schema/parameterSet'

const base: ParameterSet = {
  schemaVersion: 1,
  source: 'theory',
  createdAt: '2026-01-01T00:00:00Z',
  mechanism: DEFAULT_MECHANISM,
  feedforward: { kS: 0, kG: 0.4, kV: 2.5, kA: 0.1 },
  feedback: { kP: 50, kI: 0, kD: 0 },
  motionMagic: { cruiseVelocity: 1.5, acceleration: 6 },
}

describe('參數組比較', () => {
  it('相同的參數組沒有差異', () => {
    const d = diffParams(base, { ...base, createdAt: 'x' })
    expect(d.sameMechanism).toBe(true)
    expect(d.rows.some((r) => r.changed)).toBe(false)
    // 沒有 Slot 1 時不列那一行
    expect(d.rows.find((r) => r.key === 'kGDown')).toBeUndefined()
  })
  it('算出相對差，kI 從 0 變成非 0 時沒有相對差但標記有改', () => {
    const b = { ...base, feedforward: { ...base.feedforward, kG: 0.5 }, feedback: { ...base.feedback, kI: 1 } }
    const d = diffParams(base, b)
    const kG = d.rows.find((r) => r.key === 'kG')!
    expect(kG.changed).toBe(true)
    expect(kG.rel).toBeCloseTo(0.25)
    const kI = d.rows.find((r) => r.key === 'kI')!
    expect(kI.changed).toBe(true)
    expect(kI.rel).toBeNull()
  })
  it('只有一邊有 Slot 1 也列出來；機構不同會標出', () => {
    const b: ParameterSet = { ...base, mechanism: { ...base.mechanism, gearRatio: base.mechanism.gearRatio + 1 }, slotByDirection: { up: { kS: 0, kG: 0.4 }, down: { kS: 0, kG: 0.3 } } }
    const d = diffParams(base, b)
    expect(d.sameMechanism).toBe(false)
    const row = d.rows.find((r) => r.key === 'kGDown')!
    expect(row.a).toBeUndefined()
    expect(row.changed).toBe(true)
  })
})
