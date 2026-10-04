import { describe, expect, it } from 'vitest'
import { runDataChecks } from '../../core/analysis/checks'
import { diagnose } from '../../core/analysis/diagnose'
import { computeArmFeedforward } from '../../core/arm/feedforward'
import { alignedFromSim } from '../../core/log/sampleLog'
import { simulate } from '../../core/physics/simulate'
import { DEFAULT_ARM, type ArmParameterSet } from '../../schema/armParameterSet'
import { buildArmSimInput, DEFAULT_ARM_KNOBS } from './armSim'
import { buildArmTheory } from './armStore'
import { armGains } from './armTuning'

// 手臂 3F「送到 2F」：3F 的模擬 → 對齊欄位 → 步驟 0 資料檢查 → 診斷
const arm = DEFAULT_ARM
const ff = computeArmFeedforward(arm)
const theory = buildArmTheory(arm, ff, 0.3)

function send(ps: ArmParameterSet, gravityType: 'armCosine' | 'constant' = 'armCosine') {
  const input = buildArmSimInput(
    { arm, ff, knobs: DEFAULT_ARM_KNOBS, location: 'talonfx', goal: (80 * Math.PI) / 180, gravityType },
    ps,
  )
  const log = alignedFromSim(simulate(input))
  const report = runDataChecks(log, { statorCurrentLimit: arm.statorCurrentLimit, angle: true })
  return { log, report }
}

const opts = { mechanism: 'arm' as const, statorCurrentLimit: arm.statorCurrentLimit }

describe('手臂 3F 模擬送到 2F', () => {
  it('預設的手臂 3F 模擬（理論值）通過步驟 0', () => {
    const { log, report } = send(theory)
    expect(report.ok).toBe(true)
    expect(log.cols.feedforwardOutput).toBeDefined()
  })

  it('kG 少 40% 的模擬（跟 2F 練習日誌同條件）：2F 找出來的第一個問題是 kG', () => {
    // 練習日誌的條件：kS 0.15（範例手臂的真實摩擦）、Motion Magic 取理論上限的 40%
    const slow = { cruiseVelocity: theory.motionMagic.cruiseVelocity * 0.4, acceleration: theory.motionMagic.acceleration * 0.4 }
    const bad: ArmParameterSet = {
      ...theory,
      feedforward: { ...theory.feedforward, kS: 0.15, kG: theory.feedforward.kG * 0.6 },
      motionMagic: slow,
    }
    const { log, report } = send(bad)
    expect(report.ok).toBe(true)
    const d = diagnose(log, report, armGains(bad), bad.motionMagic, opts)
    expect(d.primary?.key).toBe('kG')
  })

  it('3F 選「常數 kG」（當成電梯）的模擬：2F 看得出前饋沒有跟著 cos θ 變', () => {
    const { log, report } = send(theory, 'constant')
    const d = diagnose(log, report, armGains(theory), theory.motionMagic, opts)
    expect(d.primary?.key).toBe('kG')
    expect(JSON.stringify(d.primary)).toMatch(/Arm_Cosine|cos/)
  })
})
