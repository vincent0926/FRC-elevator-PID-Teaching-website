import { describe, expect, it } from 'vitest'
import { runDataChecks } from '../../core/analysis/checks'
import { diagnose } from '../../core/analysis/diagnose'
import { CONTROL_PERIOD } from '../../core/controller/slot0'
import { computeFeedforward, kPFromVoltsPerCm } from '../../core/feedforward'
import { alignedFromSim } from '../../core/log/sampleLog'
import { simulate } from '../../core/physics/simulate'
import { DEFAULT_MECHANISM, type ParameterSet } from '../../schema/parameterSet'
import { buildSimInput, DEFAULT_KNOBS } from './plantKnobs'

// 3F「送到 2F」：3F 的模擬 → 對齊欄位 → 步驟 0 資料檢查 → 診斷，整條流程用 3F 的預設設定跑一次
const m = DEFAULT_MECHANISM
const ff = computeFeedforward(m)
const theory: ParameterSet = {
  schemaVersion: 1,
  source: 'theory',
  createdAt: '2026-01-01T00:00:00Z',
  mechanism: m,
  feedforward: { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA },
  feedback: { kP: kPFromVoltsPerCm(0.5), kI: 0, kD: 0 },
  motionMagic: { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration },
}

function send(ps: ParameterSet, knobs = DEFAULT_KNOBS) {
  const input = buildSimInput(
    { mechanism: m, ff, knobs, controlPeriod: CONTROL_PERIOD.talonfx, goal: m.travel * 0.75, start: m.travel * 0.1, tolerance: 0.01 },
    ps,
  )
  const log = alignedFromSim(simulate(input))
  const report = runDataChecks(log, { statorCurrentLimit: m.statorCurrentLimit })
  return { log, report }
}

describe('3F 模擬送到 2F', () => {
  it('預設的 3F 模擬（理論值）通過步驟 0，欄位齊全', () => {
    const { log, report } = send(theory)
    expect(report.ok).toBe(true)
    expect(log.cols.position?.length ?? 0).toBeGreaterThan(100)
    expect(log.cols.feedforwardOutput).toBeDefined()
    expect(log.cols.closedLoopOutput).toBeDefined()
  })

  it('用模擬時的參數診斷：理論值的模擬沒有 kG 問題', () => {
    const { log, report } = send(theory)
    const d = diagnose(log, report, { ...theory.feedforward, ...theory.feedback }, theory.motionMagic, { statorCurrentLimit: m.statorCurrentLimit })
    expect(d.primary?.key).not.toBe('kG')
  })

  it('kG 被調小的模擬：2F 找出來的第一個問題是 kG，建議往上調', () => {
    const bad: ParameterSet = { ...theory, feedforward: { ...theory.feedforward, kG: theory.feedforward.kG * 0.5 } }
    const { log, report } = send(bad)
    expect(report.ok).toBe(true)
    const d = diagnose(log, report, { ...bad.feedforward, ...bad.feedback }, bad.motionMagic, { statorCurrentLimit: m.statorCurrentLimit })
    expect(d.primary?.key).toBe('kG')
    expect(d.primary?.change?.kind).toBe('gain')
    if (d.primary?.change?.kind === 'gain') expect(d.primary.change.to).toBeGreaterThan(bad.feedforward.kG)
  })
})
