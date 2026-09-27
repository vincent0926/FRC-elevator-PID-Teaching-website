import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../tuning/sampleScenarios'
import { CASES, CHANGES, COMPONENTS, EVIDENCE, EXPECTS, PASS_SCORE, SAFETY, SYMPTOMS, grade, type Answers } from './assessment'

const ids = (l: { id: string }[]) => l.map((o) => o.id)

describe('4F 期末檢核', () => {
  it('每一題的答案都在選項裡，情境都存在於 2F 範例', () => {
    for (const c of CASES) {
      expect(SCENARIOS.find((s) => s.id === c.scenario), c.scenario).toBeDefined()
      expect(ids(SYMPTOMS)).toContain(c.symptom)
      for (const e of c.evidence) expect(ids(EVIDENCE)).toContain(e)
      expect(ids(COMPONENTS)).toContain(c.component)
      expect(ids(CHANGES)).toContain(c.change)
      expect(ids(EXPECTS)).toContain(c.expect)
      expect(c.why.length).toBeGreaterThan(10)
    }
  })
  it('每個情境的症狀都不一樣（題目分得出來）', () => {
    expect(new Set(CASES.map((c) => c.symptom)).size).toBe(CASES.length)
  })
  it('全對是滿分；選了不安全的做法，第 7 題 0 分', () => {
    const c = CASES[0]
    const full: Answers = { symptom: c.symptom, evidence: c.evidence, component: c.component, change: c.change, why: 'x', expect: c.expect, safety: SAFETY.filter((s) => s.ok).map((s) => s.id) }
    const g = grade(c, full)
    expect(g.score).toBe(g.max)
    const unsafe = grade(c, { ...full, safety: [...full.safety, 'doubleKp'] })
    expect(unsafe.parts.find((p) => p.q.startsWith('7'))!.got).toBe(0)
  })
  it('只猜對參數、沒有證據，分數不及格', () => {
    const c = CASES[3]
    const g = grade(c, { symptom: null, evidence: ['posOsc', 'fbAccel'], component: c.component, change: c.change, why: '', expect: null, safety: [] })
    expect(g.score).toBeLessThan(6)
  })
})

describe('期末檢核通過條件', () => {
  it('其他題全對、但選了不安全的做法：總分 6，不通過', () => {
    const c = CASES[0]
    const g = grade(c, { symptom: c.symptom, evidence: c.evidence, component: c.component, change: c.change, why: '', expect: c.expect, safety: ['noSoftLimit'] })
    expect(g.score).toBeGreaterThanOrEqual(PASS_SCORE)
    expect(g.passed).toBe(false)
  })
  it('上機前檢查一項都沒選也不通過', () => {
    const c = CASES[0]
    const g = grade(c, { symptom: c.symptom, evidence: c.evidence, component: c.component, change: c.change, why: '', expect: c.expect, safety: [] })
    expect(g.score).toBeGreaterThanOrEqual(PASS_SCORE)
    expect(g.passed).toBe(false)
  })
})
