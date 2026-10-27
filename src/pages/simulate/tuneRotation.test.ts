import { describe, expect, it } from 'vitest'
import { buildTheory } from '../../app/elevatorStore'
import { computeArmFeedforward } from '../../core/arm/feedforward'
import { convert, convertArm } from '../../core/codegen'
import { computeFeedforward } from '../../core/feedforward'
import { metersPerRotation } from '../../core/units'
import { DEFAULT_ARM } from '../../schema/armParameterSet'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { buildArmTheory } from '../arm/armStore'
import { getGain, rotationView, type TuneKey } from './tuneRange'

/** 3F 滑桿切到 Phoenix 6（rps）時，畫面上的數字要跟 codegen（1F 參數卡灰字、機器人設定檔）一模一樣 */

const GAINS: TuneKey[] = ['kS', 'kG', 'kV', 'kA', 'kP', 'kI', 'kD']

describe('滑桿的轉數制顯示 = codegen 的換算', () => {
  it('電梯：每圈 = 鼓輪周長（跟 controlTop 無關）', () => {
    const m = { ...DEFAULT_MECHANISM, controlTop: true }
    const ps = { ...buildTheory(m, computeFeedforward(m), 0.5), feedback: { kP: 50, kI: 3, kD: 1.5 } }
    const v = rotationView(metersPerRotation(m.drumRadius))
    const c = convert(ps)
    for (const k of GAINS) expect(getGain(ps, k) * v.display[k], k).toBeCloseTo(c.slot0[k as keyof typeof c.slot0], 9)
    expect(getGain(ps, 'cruiseVelocity') * v.display.cruiseVelocity).toBeCloseTo(c.cruiseVelocity, 9)
    expect(getGain(ps, 'acceleration') * v.display.acceleration).toBeCloseTo(c.acceleration, 9)
    expect(v.units.kV).toBe('V/rps')
    expect(v.units.cruiseVelocity).toBe('rps')
  })

  it('手臂：每圈 = 2π rad', () => {
    const ps = { ...buildArmTheory(DEFAULT_ARM, computeArmFeedforward(DEFAULT_ARM), 0.3), feedback: { kP: 17, kI: 2, kD: 0.4 } }
    const v = rotationView(2 * Math.PI)
    const c = convertArm(ps)
    for (const k of GAINS) expect(getGain(ps, k) * v.display[k], k).toBeCloseTo(c.slot0[k as keyof typeof c.slot0], 9)
    expect(getGain(ps, 'cruiseVelocity') * v.display.cruiseVelocity).toBeCloseTo(c.cruiseVelocity, 9)
    expect(getGain(ps, 'acceleration') * v.display.acceleration).toBeCloseTo(c.acceleration, 9)
  })

  it('kS、kG 是伏特，不換算', () => {
    const v = rotationView(0.12)
    expect(v.display.kS).toBe(1)
    expect(v.display.kG).toBe(1)
  })
})
