import { describe, expect, it } from 'vitest'
import { runDataChecks } from '../../core/analysis/checks'
import { computeFeedforward, kPFromVoltsPerCm } from '../../core/feedforward'
import { alignSeries, missingRequired, suggestMapping } from '../../core/log/fieldMap'
import { extractSeries, scanWpilog } from '../../core/log/reader'
import { makeSampleLog } from '../../core/log/sampleLog'
import { DEFAULT_MECHANISM, type ParameterSet } from '../../schema/parameterSet'
import { SCENARIOS } from './sampleScenarios'

// 從產生範例日誌 → 掃描 → 自動欄位對應 → 對齊 → 資料檢查，整條流程跑一次
const m = DEFAULT_MECHANISM
const ff = computeFeedforward(m)
const theory: ParameterSet = {
  schemaVersion: 1,
  source: 'theory',
  createdAt: '2026-01-01T00:00:00Z',
  mechanism: m,
  feedforward: { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA },
  feedback: { kP: kPFromVoltsPerCm(0.5), kI: 0, kD: 0 },
  motionMagic: { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration },
}

async function pipeline(id: string) {
  const sc = SCENARIOS.find((s) => s.id === id)!
  const { gains, motionMagic } = sc.build(theory, ff)
  const bytes = makeSampleLog({ mechanism: m, ff, gains, motionMagic })
  const scan = await scanWpilog([bytes])
  const map = suggestMapping(scan.entries)
  expect(missingRequired(map)).toEqual([])
  const series = await extractSeries([bytes], Object.values(map).flatMap((r) => (r.entry ? [r.entry] : [])))
  return runDataChecks(alignSeries(series, map), { statorCurrentLimit: m.statorCurrentLimit })
}

describe('練習用範例日誌', () => {
  it('參數正確的日誌通過資料檢查', async () => {
    const r = await pipeline('good')
    expect(r.ok).toBe(true)
    expect(r.items.find((i) => i.key === 'saturation')?.status).toBe('pass')
  })

  it.each(['lowKg', 'highKv', 'noKs'])('%s：參數錯但不是物理限制，資料仍可分析', async (id) => {
    expect((await pipeline(id)).ok).toBe(true)
  })

  it('Motion Magic 太快時被步驟 0 擋下（電壓飽和）', async () => {
    const r = await pipeline('saturate')
    expect(r.ok).toBe(false)
    expect(['warn', 'fail']).toContain(r.items.find((i) => i.key === 'saturation')?.status)
  })
})
