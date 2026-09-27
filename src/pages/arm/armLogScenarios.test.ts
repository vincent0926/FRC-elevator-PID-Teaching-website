import { describe, expect, it } from 'vitest'
import { runDataChecks } from '../../core/analysis/checks'
import { diagnose, estimateRobotGains } from '../../core/analysis/diagnose'
import { computeArmFeedforward } from '../../core/arm/feedforward'
import { armSampleAlignedLog } from '../../core/arm/sampleLog'
import { DEFAULT_ARM } from '../../schema/armParameterSet'
import { ARM_LOG_SCENARIOS } from './armLogScenarios'
import { buildArmTheory } from './armStore'
import { armGains } from './armTuning'

const ff = computeArmFeedforward(DEFAULT_ARM)
const theory = buildArmTheory(DEFAULT_ARM, ff, 0.3)

describe('手臂 2F 範例日誌的診斷', () => {
  for (const sc of ARM_LOG_SCENARIOS) {
    it(`${sc.label} → ${sc.expect ?? '沒問題'}`, () => {
      const b = sc.build(theory, ff)
      const log = armSampleAlignedLog({ arm: DEFAULT_ARM, ff, ...b })
      const report = runDataChecks(log, { statorCurrentLimit: DEFAULT_ARM.statorCurrentLimit, angle: true })
      if (sc.expect === 'refused') {
        expect(report.ok).toBe(false)
        return
      }
      expect(report.ok, report.items.map((i) => `${i.key}:${i.status} ${i.detail}`).join('\n')).toBe(true)
      const d = diagnose(log, report, b.gains, b.motionMagic, { mechanism: 'arm', statorCurrentLimit: DEFAULT_ARM.statorCurrentLimit, controlPeriod: b.controlPeriod })
      expect(d.primary?.key ?? null, JSON.stringify(d.issues.map((i) => [i.key, i.summary]))).toBe(sc.expect)
    })
  }
})

describe('從手臂日誌推回機器人上的參數', () => {
  it('前饋欄位對 cos θ 迴歸，推回的 kG、kV 跟設定的一樣', () => {
    const b = ARM_LOG_SCENARIOS.find((s) => s.id === 'lowKg')!.build(theory, ff)
    const log = armSampleAlignedLog({ arm: DEFAULT_ARM, ff, ...b })
    const est = estimateRobotGains(log, armGains(theory), undefined, 'arm')!
    expect(est.gains.kG).toBeCloseTo(b.gains.kG, 2)
    expect(est.gains.kV / b.gains.kV).toBeCloseTo(1, 1)
  })
})
