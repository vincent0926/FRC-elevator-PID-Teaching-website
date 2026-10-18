import { describe, expect, it } from 'vitest'
import {
  computeFlywheelFeedforward,
  DEFAULT_FLYWHEEL,
  DEFAULT_FLYWHEEL_SPEC,
  DEFAULT_KNOBS,
  DEFAULT_PLAN,
  flywheelFailures,
  flywheelMetrics,
  simulateFlywheel,
  theoryGains,
} from '../../core/flywheel/flywheel'
import { FLYWHEEL_PRESETS, gainRange } from './flywheelTune'

const theory = theoryGains(computeFlywheelFeedforward(DEFAULT_FLYWHEEL))
const fails = (id: string) => {
  const g = FLYWHEEL_PRESETS.find((p) => p.id === id)!.gains(theory, DEFAULT_KNOBS)
  const res = simulateFlywheel(DEFAULT_FLYWHEEL, g, DEFAULT_KNOBS, DEFAULT_PLAN)
  return flywheelFailures(flywheelMetrics(res, DEFAULT_PLAN, DEFAULT_FLYWHEEL_SPEC), DEFAULT_PLAN, DEFAULT_FLYWHEEL_SPEC)
}

describe('射球飛輪的試試看', () => {
  it('說明文字跟模擬結果對得上', () => {
    expect(fails('ffOnly')).toEqual(['recovery'])
    expect(fails('kVLow')).toContain('steady')
    expect(fails('kITooBig')).toContain('overshoot')
    expect(fails('tuned')).toEqual([])
  })

  it('理論值在滑桿範圍內；超出時上限撐大', () => {
    for (const k of ['kS', 'kV', 'kA', 'kP', 'kI', 'kD'] as const) {
      const r = gainRange(k, theory, theory[k])
      expect(theory[k]).toBeGreaterThanOrEqual(r.min)
      expect(theory[k]).toBeLessThanOrEqual(r.max)
    }
    expect(gainRange('kP', theory, 10).max).toBeCloseTo(12, 9)
  })
})
