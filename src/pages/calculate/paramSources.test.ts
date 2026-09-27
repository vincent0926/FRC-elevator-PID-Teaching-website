import { describe, expect, it } from 'vitest'
import { INPUT_ROWS, KIND_INFO, PARAM_NAMES, PARAM_ROWS } from './paramSources'

describe('1F 參數來源對照表', () => {
  it('參數卡上的每個參數都有分類', () => {
    expect(PARAM_ROWS.map((r) => r.name).sort()).toEqual([...PARAM_NAMES].sort())
  })

  it('分類符合設計：kV 算得準、kG/kA 算再量、kS 一定要量、PID 與 Motion Magic 自己決定', () => {
    const kind = Object.fromEntries(PARAM_ROWS.map((r) => [r.name, r.kind]))
    expect(kind.kV).toBe('calc')
    expect(kind.kG).toBe('calcThenMeasure')
    expect(kind.kA).toBe('calcThenMeasure')
    expect(kind.kS).toBe('measure')
    for (const k of ['kP', 'kI', 'kD', '巡航速度', '加速度']) expect(kind[k]).toBe('choose')
  })

  it('每一列都有說明，機構資料的質量一定要量', () => {
    for (const r of [...PARAM_ROWS, ...INPUT_ROWS]) {
      expect(KIND_INFO[r.kind]).toBeDefined()
      expect(r.how.length).toBeGreaterThan(3)
    }
    expect(INPUT_ROWS.find((r) => r.name.includes('質量'))?.kind).toBe('measure')
  })
})
