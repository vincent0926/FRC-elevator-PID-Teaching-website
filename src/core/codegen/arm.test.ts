import { describe, expect, it } from 'vitest'
import { computeArmFeedforward } from '../arm/feedforward'
import { ArmRobotConfigSchema } from '../../schema/robotConfig'
import { DEFAULT_ARM, type ArmParameterSet } from '../../schema/armParameterSet'
import { renderArmGains, toArmRobotConfig } from './arm'
import { convertArm, jd } from './index'

const ff = computeArmFeedforward(DEFAULT_ARM)
const ps: ArmParameterSet = {
  schemaVersion: 1,
  source: 'theory',
  createdAt: '2026-09-27T00:00:00.000Z',
  mechanism: DEFAULT_ARM,
  feedforward: { kS: 0.1, kG: ff.kG, kV: ff.kV, kA: ff.kA },
  feedback: { kP: 20, kI: 0, kD: 0.5 },
  motionMagic: { cruiseVelocity: 3, acceleration: 10 },
}
const NOW = new Date('2026-09-27T00:00:00Z')

describe('手臂 Java 與 JSON 輸出', () => {
  it('GravityType 是 Arm_Cosine，不是 Elevator_Static', () => {
    const java = renderArmGains(ps, NOW)
    expect(java).toContain('GravityTypeValue.Arm_Cosine')
    expect(java).not.toContain('Elevator_Static')
    expect(java).toContain(`.withKP(${jd(convertArm(ps).slot0.kP)})`)
    expect((java.match(/{/g) ?? []).length).toBe((java.match(/}/g) ?? []).length)
  })

  it('內建編碼器與 CANcoder 兩種都輸出對應的設定', () => {
    expect(renderArmGains(ps, NOW)).toContain('USE_CANCODER = false;')
    const cc = renderArmGains({ ...ps, mechanism: { ...DEFAULT_ARM, encoder: 'cancoder', cancoderToArmRatio: 2 } }, NOW)
    expect(cc).toContain('USE_CANCODER = true;')
    expect(cc).toContain('CANCODER_TO_ARM_RATIO = 2.0;')
  })

  it('角度範圍輸出成度', () => {
    const java = renderArmGains(ps, NOW)
    expect(java).toContain('MIN_ANGLE_DEG = -20.0;')
    expect(java).toContain('MAX_ANGLE_DEG = 110.0;')
  })

  it('JSON 符合 schema，速度換成手臂 rps', () => {
    const cfg = toArmRobotConfig(ps, NOW)
    expect(ArmRobotConfigSchema.safeParse(cfg).success).toBe(true)
    expect(cfg.motionMagic.cruiseVelocity).toBeCloseTo(3 / (2 * Math.PI))
    expect(cfg.slot0.kG).toBeCloseTo(ff.kG)
  })
})
