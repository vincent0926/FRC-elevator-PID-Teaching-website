import { describe, expect, it } from 'vitest'
import { computeFeedforward } from '../feedforward'
import { metersPerRotation } from '../units'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { compareSysId, sysIdToSi, type FfGains } from './sysid'

const m = DEFAULT_MECHANISM
const theoryOf = (mech = m): FfGains => {
  const ff = computeFeedforward(mech)
  return { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA }
}
const theory = theoryOf()
const levels = (c: ReturnType<typeof compareSysId>) => Object.fromEntries(c.rows.map((r) => [r.key, r.level]))

describe('SysId 與理論值比較', () => {
  it('轉數制換回 SI：kS、kG 不變，kV、kA 除以每圈公尺數', () => {
    const mpr = metersPerRotation(m.drumRadius)
    const si = sysIdToSi({ kS: 0.2, kG: 0.5, kV: 0.6, kA: 0.01 }, 'rotations', mpr)
    expect(si.kS).toBe(0.2)
    expect(si.kG).toBe(0.5)
    expect(si.kV).toBeCloseTo(0.6 / mpr, 9)
    expect(si.kA).toBeCloseTo(0.01 / mpr, 9)
    expect(sysIdToSi(si, 'meters', mpr)).toEqual(si)
  })

  it('量到的跟理論差不多：全部 ok', () => {
    const c = compareSysId(theory, { kS: 0.2, kG: theory.kG * 1.05, kV: theory.kV * 0.97, kA: theory.kA * 1.2 }, 2)
    expect(levels(c)).toEqual({ kS: 'ok', kG: 'ok', kV: 'ok', kA: 'ok' })
    expect(c.findings[0]).toContain('對得上')
  })

  it('實際齒比比填的大 30%：認出齒比或半徑填錯', () => {
    // 真正的機構齒比 6.5，網站填 5
    const real = theoryOf({ ...m, gearRatio: 6.5 })
    const c = compareSysId(theory, { ...real, kS: 0.15 }, 2)
    expect(levels(c).kV).toBe('bad')
    expect(c.findings[0]).toContain('齒比')
  })

  it('實際比填的重 40%：認出質量填錯', () => {
    const real = theoryOf({ ...m, stages: m.stages.map((s) => ({ ...s, mass: s.mass * 1.4 })), payloadMass: m.payloadMass * 1.4 })
    const c = compareSysId(theory, { ...real, kS: 0.15 }, 2)
    expect(levels(c).kV).toBe('ok')
    expect(c.findings[0]).toContain('質量')
  })

  it('SysId 用最上層高度當座標：認出座標不一致', () => {
    const c = compareSysId(theory, { kS: 0.15, kG: theory.kG, kV: theory.kV / 2, kA: theory.kA / 2 }, 2)
    expect(c.findings[0]).toContain('座標')
  })

  it('只有 kG 不同：提示配重或彈簧', () => {
    const c = compareSysId(theory, { kS: 0.15, kG: theory.kG * 0.6, kV: theory.kV, kA: theory.kA }, 2)
    expect(c.findings[0]).toContain('配重')
  })

  it('負值或 0：資料不能用', () => {
    const c = compareSysId(theory, { kS: -0.1, kG: theory.kG, kV: theory.kV, kA: 0 }, 2)
    expect(levels(c).kS).toBe('bad')
    expect(levels(c).kA).toBe('bad')
    expect(c.findings[0]).toContain('不能用')
  })

  it('摩擦太大會警告', () => {
    expect(levels(compareSysId(theory, { ...theory, kS: 1.5 })).kS).toBe('bad')
    expect(levels(compareSysId(theory, { ...theory, kS: 0.7 })).kS).toBe('warn')
  })
})
