import { describe, expect, it } from 'vitest'
import { convert, jd, phoenix6_2026, toRobotConfig } from './index'
import { DEFAULT_MECHANISM, ParameterSetSchema, type ParameterSet } from '../../schema/parameterSet'
import { RobotConfigSchema } from '../../schema/robotConfig'

const ps: ParameterSet = {
  schemaVersion: 1,
  source: 'theory',
  createdAt: '2026-09-27T00:00:00.000Z',
  mechanism: { ...DEFAULT_MECHANISM, drumRadius: 0.02 },
  feedforward: { kS: 0.1, kG: 0.5, kV: 2, kA: 0.1 },
  feedback: { kP: 50, kI: 0, kD: 1 },
  motionMagic: { cruiseVelocity: 1.5, acceleration: 6 },
}

describe('codegen', () => {
  it('參數組通過 schema', () => {
    expect(ParameterSetSchema.safeParse(ps).success).toBe(true)
  })

  it('kV、kA、kP、kD 乘 2πr；kS、kG 不換', () => {
    const c = convert(ps)
    const k = 2 * Math.PI * 0.02
    expect(c.slot0.kS).toBe(0.1)
    expect(c.slot0.kG).toBe(0.5)
    expect(c.slot0.kV).toBeCloseTo(2 * k)
    expect(c.slot0.kA).toBeCloseTo(0.1 * k)
    expect(c.slot0.kP).toBeCloseTo(50 * k)
    expect(c.slot0.kD).toBeCloseTo(1 * k)
    expect(c.cruiseVelocity).toBeCloseTo(1.5 / k)
    expect(c.acceleration).toBeCloseTo(6 / k)
  })

  it('控制最上層高度：增益的轉數制不變，位置換算乘最上層速度比', () => {
    const top = convert({ ...ps, mechanism: { ...ps.mechanism, controlTop: true } })
    const base = convert(ps)
    expect(top.slot0).toEqual(base.slot0)
    expect(top.metersPerRotation).toBeCloseTo(base.metersPerRotation * 2)
  })

  it('摩擦不對稱時產生 Slot 1', () => {
    const c = convert({ ...ps, slotByDirection: { up: { kS: 0.2, kG: 0.55 }, down: { kS: 0.1, kG: 0.45 } } })
    expect(c.slot0.kS).toBe(0.2)
    expect(c.slot1!.kG).toBe(0.45)
    expect(phoenix6_2026.render({ ...ps, slotByDirection: { up: { kS: 0.2, kG: 0.55 }, down: { kS: 0.1, kG: 0.45 } } })).toContain('Slot1Configs slot1()')
  })

  it('JSON 設定檔符合 schema', () => {
    const cfg = toRobotConfig(ps, new Date('2026-09-27T00:00:00Z'))
    expect(RobotConfigSchema.safeParse(cfg).success).toBe(true)
    expect(cfg.slot1).toBeUndefined()
  })

  it('Java 範本包含換算後的數值與必要設定', () => {
    const java = phoenix6_2026.render(ps, new Date('2026-09-27T00:00:00Z'))
    const c = convert(ps)
    expect(java).toContain(`.withKV(${jd(c.slot0.kV)})`)
    expect(java).toContain('GravityTypeValue.Elevator_Static')
    expect(java).toContain('public static final double GEAR_RATIO = 5.0;')
    // 沒有摩擦不對稱時 slot1() 回傳 null，機器人端的讀取器就知道不用切換 Slot
    expect(java).toMatch(/Slot1Configs slot1\(\) {\s+return null;/)
    // 大括號配對
    expect((java.match(/{/g) ?? []).length).toBe((java.match(/}/g) ?? []).length)
  })

  it('jd 輸出合法的 Java double', () => {
    expect(jd(5)).toBe('5.0')
    expect(jd(0)).toBe('0.0')
    expect(jd(0.123456789)).toBe('0.123457')
    expect(jd(1e-7)).toMatch(/^0\.0+10*$/)
    expect(() => jd(NaN)).toThrow()
  })
})
