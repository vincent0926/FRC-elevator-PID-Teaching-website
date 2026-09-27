import { describe, expect, it } from 'vitest'
import { grade } from '../learn/assessment'
import { ARM_CASES, ARM_LISTS } from './armAssessment'
import { ARM_LOG_SCENARIOS } from './armLogScenarios'

describe('手臂期末檢核', () => {
  it('每一題都對應到存在的情境與選項', () => {
    const has = (list: { id: string }[], id: string) => list.some((o) => o.id === id)
    for (const c of ARM_CASES) {
      expect(ARM_LOG_SCENARIOS.some((s) => s.id === c.scenario)).toBe(true)
      expect(has(ARM_LISTS.symptoms, c.symptom)).toBe(true)
      for (const e of c.evidence) expect(has(ARM_LISTS.evidence, e)).toBe(true)
      expect(has(ARM_LISTS.components, c.component)).toBe(true)
      expect(has(ARM_LISTS.changes, c.change)).toBe(true)
      expect(has(ARM_LISTS.expects, c.expect)).toBe(true)
    }
  })

  it('全對通過；選了「用手扶著手臂」不通過', () => {
    const c = ARM_CASES[1]
    const safe = ARM_LISTS.safety.filter((s) => s.ok).map((s) => s.id)
    const a = { symptom: c.symptom, evidence: c.evidence, component: c.component, change: c.change, why: '', expect: c.expect, safety: safe }
    expect(grade(c, a, ARM_LISTS).passed).toBe(true)
    expect(grade(c, { ...a, safety: [...safe, 'holdArm'] }, ARM_LISTS).passed).toBe(false)
  })
})
