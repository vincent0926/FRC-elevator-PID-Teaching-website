import { describe, expect, it } from 'vitest'
import { buildTheory } from '../../app/store'
import { CONTROL_PERIOD } from '../../core/controller/slot0'
import { computeFeedforward } from '../../core/feedforward'
import { simulate, type SimResult } from '../../core/physics/simulate'
import { DEFAULT_MECHANISM, type ParameterSet } from '../../schema/parameterSet'
import { buildSimInput, DEFAULT_KNOBS, type PlantKnobs } from './plantKnobs'
import { SIM_SCENARIOS } from './simScenarios'

/** 每個教學情境都要真的看得到說明裡講的現象（Phase 3 步驟 7 完成標準） */

const mechanism = DEFAULT_MECHANISM
const ff = computeFeedforward(mechanism)
const theory = buildTheory(mechanism, ff, 0.5)
const goal = mechanism.travel * 0.75

function run(id: string, patch: { params?: (p: ParameterSet) => ParameterSet; knobs?: Partial<PlantKnobs>; location?: 'talonfx' | 'roborio' } = {}): SimResult {
  const sc = SIM_SCENARIOS.find((s) => s.id === id)!
  const s = sc.setup(theory, ff)
  const ps = patch.params ? patch.params(s.params) : s.params
  const knobs = { ...DEFAULT_KNOBS, ...s.knobs, ...patch.knobs }
  return simulate(buildSimInput({ mechanism, ff, knobs, controlPeriod: CONTROL_PERIOD[patch.location ?? s.location], goal }, ps))
}
const fb = (p: ParameterSet, f: Partial<ParameterSet['feedback']>) => ({ ...p, feedback: { ...p.feedback, ...f } })
const ffp = (p: ParameterSet, f: Partial<ParameterSet['feedforward']>) => ({ ...p, feedforward: { ...p.feedforward, ...f } })

describe('3F 教學情境', () => {
  it('每個情境都有完整說明，id 不重複', () => {
    expect(new Set(SIM_SCENARIOS.map((s) => s.id)).size).toBe(SIM_SCENARIOS.length)
    for (const s of SIM_SCENARIOS) {
      expect(s.concept.length).toBeGreaterThan(20)
      expect(s.lookFor.length).toBeGreaterThan(10)
      expect(s.tryNext.length).toBeGreaterThan(10)
      expect(s.setup(theory, ff).params.source).toBe('custom')
    }
  })

  it('只有 kP：跟隨誤差很大，填回前饋後變小', () => {
    const bad = run('onlyKp')
    const good = run('onlyKp', { params: (p) => ffp(p, theory.feedforward) })
    expect(bad.moves[0].maxFollowingError).toBeGreaterThan(0.1)
    expect(good.moves[0].maxFollowingError).toBeLessThan(0.01)
  })

  it('沒有 kG：兩個方向都停在目標下面 kG/kP', () => {
    const r = run('noKg')
    const kP = SIM_SCENARIOS.find((s) => s.id === 'noKg')!.setup(theory, ff).params.feedback.kP
    for (const m of r.moves) expect(m.steadyStateError).toBeCloseTo(ff.kG / kP, 2)
    expect(r.pos[r.pos.length - 1]).toBeLessThan(r.moves[1].goal)
  })

  it('kP 太大：振盪、電壓飽和；降 kP 後就穩', () => {
    const bad = run('kPTooBig')
    const good = run('kPTooBig', { params: (p) => fb(p, { kP: 150 }) })
    expect(bad.moves[0].saturationFraction).toBeGreaterThan(0.2)
    expect(bad.moves[0].holdVoltageRipple).toBeGreaterThan(1)
    expect(good.moves[0].holdVoltageRipple).toBeLessThan(0.1)
    expect(good.moves[0].settlingTime).not.toBeNull()
  })

  it('kD 太大：到位後電壓抖動遠大於 kD = 0', () => {
    const bad = run('kDTooBig')
    const good = run('kDTooBig', { params: (p) => fb(p, { kD: 0 }) })
    expect(bad.moves[0].holdVoltageRipple).toBeGreaterThan(0.5)
    expect(good.moves[0].holdVoltageRipple).toBeLessThan(bad.moves[0].holdVoltageRipple / 5)
  })

  it('為什麼不用 kI：輸出飽和時積分讓電梯衝過頭；修 kG、拿掉 kI 就沒有', () => {
    const bad = run('whyNoKi')
    const good = run('whyNoKi', { params: (p) => fb(ffp(p, { kG: ff.kG }), { kI: 0 }) })
    expect(bad.moves[0].overshoot).toBeGreaterThan(0.03)
    expect(good.moves[0].overshoot).toBeLessThan(0.01)
  })

  it('控制週期：同一組參數 roboRIO 振盪、TalonFX 穩', () => {
    const rio = run('controlPeriod')
    const tfx = run('controlPeriod', { location: 'talonfx' })
    expect(rio.moves[0].holdVoltageRipple).toBeGreaterThan(1)
    expect(tfx.moves[0].holdVoltageRipple).toBeLessThan(0.1)
    expect(tfx.moves[0].maxFollowingError).toBeLessThan(rio.moves[0].maxFollowingError)
  })

  it('感測延遲：超調比 5 ms 延遲大很多', () => {
    const bad = run('sensorDelay')
    const good = run('sensorDelay', { knobs: { sensorDelay: 0.005 } })
    expect(bad.moves[0].overshoot).toBeGreaterThan(0.02)
    expect(good.moves[0].overshoot).toBeLessThan(0.01)
  })

  it('電池太低：往上飽和、落後；往下沒事', () => {
    const r = run('lowBattery')
    expect(r.moves[0].saturationFraction).toBeGreaterThan(0.1)
    expect(r.moves[0].maxFollowingError).toBeGreaterThan(0.03)
    expect(r.moves[1].maxFollowingError).toBeLessThan(0.01)
    const full = run('lowBattery', { knobs: { batteryVoltage: 12.5 } })
    expect(full.moves[0].saturationFraction).toBeLessThan(0.02)
  })

  it('超過電流限制：觸發限流、跟隨誤差大', () => {
    const r = run('currentLimit')
    expect(r.moves[0].currentLimitFraction).toBeGreaterThan(0.03)
    expect(Math.max(r.moves[0].maxFollowingError, r.moves[1].maxFollowingError)).toBeGreaterThan(0.03)
  })

  it('摩擦不對稱：平均 kS 已經在 1 cm 內；Slot 切換更準', () => {
    const avg = run('asymFriction')
    for (const m of avg.moves) expect(m.maxFollowingError).toBeLessThan(0.01)
    const slot = run('asymFriction', {
      params: (p) => ({ ...p, slotByDirection: { up: { kS: 0.35, kG: p.feedforward.kG }, down: { kS: 0.05, kG: p.feedforward.kG } } }),
    })
    expect(slot.moves.map((m) => m.slot)).toEqual([0, 1])
    expect(slot.moves[0].maxFollowingError).toBeLessThan(avg.moves[0].maxFollowingError)
  })

  it('換級 kG 跳變：上半段停低 ≈ 跳變 / kP，下半段準', () => {
    const r = run('stageJump')
    expect(r.moves[0].steadyStateError).toBeCloseTo(0.8 / theory.feedback.kP, 2)
    expect(r.moves[1].steadyStateError).toBeLessThan(0.005)
  })

  it('目標超過軟體限位：停在限位附近，到不了目標', () => {
    const r = run('softLimit')
    const fwd = Math.round(mechanism.travel * 0.6 * 100) / 100
    expect(r.moves[0].softLimitFraction).toBeGreaterThan(0)
    expect(Math.max(...r.pos)).toBeLessThan(fwd + 0.05)
    expect(r.moves[0].steadyStateError).toBeGreaterThan(goal - fwd - 0.05)
    // 限位調高就沒事
    const ok = run('softLimit', { knobs: { softForward: mechanism.travel } })
    expect(ok.moves[0].softLimitFraction).toBe(0)
  })

  it('Supply 限制太低：觸發限流、跟隨誤差比 40 A 大', () => {
    const low = run('supplyLimit')
    const ok = run('supplyLimit', { knobs: { supplyLimitA: 40 } })
    expect(low.moves[0].supplyLimitFraction).toBeGreaterThan(0.02)
    expect(low.moves[0].maxFollowingError).toBeGreaterThan(ok.moves[0].maxFollowingError)
  })

  it('SPARK MAX 沒開電壓補償：停得比開了補償低', () => {
    const noComp = run('sparkNoComp')
    const comp = run('sparkNoComp', { knobs: { voltageComp: true, voltageCompV: 10 } })
    expect(noComp.moves[0].steadyStateError).toBeGreaterThan(0.01)
    expect(comp.moves[0].steadyStateError).toBeLessThan(noComp.moves[0].steadyStateError / 2)
  })
})
