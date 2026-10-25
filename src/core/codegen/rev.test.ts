import { describe, expect, it } from 'vitest'
import { computeArmFeedforward } from '../arm/feedforward'
import { DEFAULT_ARM, type ArmParameterSet } from '../../schema/armParameterSet'
import type { ParameterSet } from '../../schema/parameterSet'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { convert, convertArm, jd } from './index'
import { NOMINAL_VOLTS, revArmJava, revElevatorJava, revFlywheelJava } from './rev'

const NOW = new Date('2026-10-25T00:00:00Z')
const armFf = computeArmFeedforward(DEFAULT_ARM)
const arm: ArmParameterSet = {
  schemaVersion: 1,
  source: 'theory',
  createdAt: NOW.toISOString(),
  mechanism: DEFAULT_ARM,
  feedforward: { kS: 0.1, kG: armFf.kG, kV: armFf.kV, kA: armFf.kA },
  feedback: { kP: 24, kI: 0, kD: 0.6 },
  motionMagic: { cruiseVelocity: 3, acceleration: 10 },
}
const elevator = (over: Partial<ParameterSet> = {}): ParameterSet => ({
  schemaVersion: 1,
  source: 'theory',
  createdAt: NOW.toISOString(),
  mechanism: DEFAULT_MECHANISM,
  feedforward: { kS: 0.2, kG: 0.5, kV: 7, kA: 0.1 },
  feedback: { kP: 120, kI: 0, kD: 2 },
  motionMagic: { cruiseVelocity: 1.2, acceleration: 4 },
  ...over,
})

const balanced = (s: string) => (s.match(/{/g) ?? []).length === (s.match(/}/g) ?? []).length && (s.match(/\(/g) ?? []).length === (s.match(/\)/g) ?? []).length

describe('REV SPARK 輸出', () => {
  it('電梯：前饋用 kG、數值跟 Phoenix 6 轉數制一致', () => {
    const ps = elevator()
    const java = revElevatorJava(ps, NOW)
    const g = convert(ps).slot0
    expect(java).toContain(`.kG(${jd(g.kG)})`)
    expect(java).toContain(`.kV(${jd(g.kV)})`)
    expect(java).toContain(`.kA(${jd(g.kA)})`)
    expect(java).toContain(`.p(${jd(g.kP)} / NOMINAL_VOLTS)`)
    expect(java).not.toContain('kCos')
    expect(balanced(java)).toBe(true)
  })

  it('電梯：摩擦不對稱時，往下的值寫成常數', () => {
    const ps = elevator({ slotByDirection: { up: { kS: 0.2, kG: 0.6 }, down: { kS: 0.2, kG: 0.4 } } })
    const java = revElevatorJava(ps, NOW)
    expect(java).toContain('DOWN_KG = ' + jd(convert(ps).slot1!.kG))
    expect(revElevatorJava(elevator(), NOW)).not.toContain('DOWN_KG')
  })

  it('手臂：用 kCos 不用 kG，kCosRatio 是 1', () => {
    const java = revArmJava(arm, NOW)
    expect(java).toContain(`.kCos(${jd(convertArm(arm).slot0.kG)})`)
    expect(java).toContain('.kCosRatio(1.0)')
    expect(java).not.toContain('.kG(')
    expect(balanced(java)).toBe(true)
  })

  it('手臂：選 CANcoder 時提醒 SPARK 讀不到', () => {
    const cc = { ...arm, mechanism: { ...DEFAULT_ARM, encoder: 'cancoder' as const } }
    expect(revArmJava(cc, NOW)).toContain('CANcoder')
    expect(revArmJava(arm, NOW)).toContain('encoder.setPosition')
  })

  it('P、I、D 除以 12（工作週期），不是直接貼伏特', () => {
    expect(NOMINAL_VOLTS).toBe(12)
    expect(revElevatorJava(elevator(), NOW)).toContain('NOMINAL_VOLTS = 12.0')
  })

  it('射球飛輪：有加速度限制用 MAXMotion 速度，沒有就用一般速度', () => {
    const base = { kS: 0.1, kV: 0.02, kA: 0.003, kP: 0.05, kI: 0, kD: 0 }
    const mech = { gearRatio: 1, motorCount: 2 } as never
    const knobs = { noReverse: true, statorLimit: 60 } as never
    const withMagic = revFlywheelJava(base, mech, knobs, { accel: 300, target: 400 } as never)
    expect(withMagic).toContain('kMAXMotionVelocityControl')
    expect(withMagic).toContain('maxAcceleration')
    expect(withMagic).toContain('smartCurrentLimit((int) 60)')
    const plain = revFlywheelJava(base, mech, { noReverse: false, statorLimit: 0 } as never, { accel: 0, target: 400 } as never)
    expect(plain).toContain('ControlType.kVelocity')
    expect(plain).not.toContain('smartCurrentLimit')
  })
})
