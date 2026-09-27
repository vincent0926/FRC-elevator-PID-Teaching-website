import { describe, expect, it } from 'vitest'
import { computeArmFeedforward } from '../../core/arm/feedforward'
import { simulate, type SimResult } from '../../core/physics/simulate'
import { DEFAULT_ARM, DEG } from '../../schema/armParameterSet'
import { buildArmTheory } from './armStore'
import { ARM_SCENARIOS, type ArmScenarioSetup } from './armScenarios'
import { DEFAULT_ARM_KNOBS, buildArmSimInput } from './armSim'

const arm = DEFAULT_ARM
const ff = computeArmFeedforward(arm)
const theory = buildArmTheory(arm, ff, 0.3)

function run(id: string, patch: Partial<ArmScenarioSetup> & { knobs?: ArmScenarioSetup['knobs'] } = {}): SimResult {
  const s = ARM_SCENARIOS.find((x) => x.id === id)!.setup(theory, ff)
  const st = { ...s, ...patch, knobs: { ...s.knobs, ...patch.knobs } }
  return simulate(buildArmSimInput({ arm, ff, knobs: { ...DEFAULT_ARM_KNOBS, ...st.knobs }, location: st.location, goal: st.goal, gravityType: st.gravityType, tolerance: DEG }, st.params))
}
const endAngle = (r: SimResult, moveEnd: number) => {
  const i = r.t.findIndex((t) => t >= moveEnd)
  return r.pos[i]
}

describe('3F 手臂教學情境', () => {
  it('每個情境都有說明，id 不重複', () => {
    expect(new Set(ARM_SCENARIOS.map((s) => s.id)).size).toBe(ARM_SCENARIOS.length)
    for (const s of ARM_SCENARIOS) expect(s.concept.length + s.lookFor.length + s.tryNext.length).toBeGreaterThan(60)
  })
  it('把手臂當電梯：停在目標上面；改回 Arm_Cosine 就準', () => {
    const bad = run('armAsElevator')
    const good = run('armAsElevator', { gravityType: 'armCosine' })
    expect(bad.moves[0].steadyStateError).toBeGreaterThan(1 * DEG)
    expect(good.moves[0].steadyStateError).toBeLessThan(0.2 * DEG)
    expect(endAngle(bad, bad.moves[1] ? 0.5 + bad.moves[0].profileDuration + 1.4 : 2)).toBeGreaterThan(80 * DEG)
  })
  it('沒有 kG：停在目標下面超過 1°', () => {
    const r = run('noKg')
    expect(r.moves[0].steadyStateError).toBeGreaterThan(1 * DEG)
  })
  it('轉過直立：停在 110° 時前饋是負的（kG·cos 110°）', () => {
    const r = run('crossVertical')
    // 找軌跡已經停下（參考速度 0）而且在 110° 附近的點
    const i = r.t.findIndex((_, k) => r.refVel[k] === 0 && r.refPos[k] > 105 * DEG)
    expect(i).toBeGreaterThan(0)
    expect(r.feedforward[i]).toBeCloseTo(ff.kG * Math.cos(110 * DEG), 3)
    expect(r.feedforward[i]).toBeLessThan(0)
    const j = r.pos.findIndex((p) => p > 30 * DEG)
    expect(r.feedforward[j]).toBeGreaterThan(0)
  })
  it('負載變重：停在目標下面，比理論手臂差很多', () => {
    const bad = run('heavyPayload')
    const good = run('heavyPayload', { knobs: { kGScale: 1, kAScale: 1 } })
    expect(bad.moves[0].steadyStateError).toBeGreaterThan(1 * DEG)
    expect(good.moves[0].steadyStateError).toBeLessThan(0.2 * DEG)
  })
  it('零點設錯：誤差明顯；零點設對就好', () => {
    const bad = run('wrongZero')
    const good = run('wrongZero', { knobs: { zeroOffset: 0 } })
    expect(bad.moves[0].steadyStateError).toBeGreaterThan(0.5 * DEG)
    expect(good.moves[0].steadyStateError).toBeLessThan(0.2 * DEG)
  })
  it('用 kI 補 kG：積分飽和衝過頭；kG 修好、kI 0 就不會', () => {
    const bad = run('armWindup')
    // 同樣快的軌跡，只把 kG 修好、kI 拿掉
    const sc = ARM_SCENARIOS.find((x) => x.id === 'armWindup')!.setup(theory, ff).params
    const good = run('armWindup', { params: { ...sc, feedforward: { ...sc.feedforward, kG: ff.kG }, feedback: { ...sc.feedback, kI: 0 } } })
    expect(bad.moves[0].overshoot).toBeGreaterThan(2 * DEG)
    expect(good.moves[0].overshoot).toBeLessThan(0.5 * DEG)
  })

  it('kP 太大：到位電壓抖；kP 正常就穩', () => {
    const bad = run('armKpTooBig')
    const good = run('armKpTooBig', { params: { ...theory, feedforward: { ...theory.feedforward, kS: 0.15 } } })
    expect(bad.moves[0].holdVoltageRipple).toBeGreaterThan(1)
    expect(good.moves[0].holdVoltageRipple).toBeLessThan(0.3)
  })
})
