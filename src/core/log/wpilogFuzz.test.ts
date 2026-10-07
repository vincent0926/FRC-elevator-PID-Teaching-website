import { describe, expect, it } from 'vitest'
import { scanWpilog, extractSeries } from './reader'
import { makeSampleLog } from './sampleLog'
import { WpilogFormatError } from './wpilog'
import { computeFeedforward } from '../feedforward'
import { DEFAULT_MECHANISM } from '../../schema/parameterSet'
import { buildTheory } from '../../app/store'
const mech = DEFAULT_MECHANISM; const ff0 = computeFeedforward(mech); const th = buildTheory(mech, ff0, 0.5)

describe('wpilog 損毀檔案', () => {
  const good = makeSampleLog({ mechanism: mech, ff: ff0, gains: { ...th.feedforward, ...th.feedback } as never, motionMagic: th.motionMagic })
  it('截斷、亂碼、位元翻轉只會正常回傳或丟 WpilogFormatError，不會丟 RangeError', async () => {
    let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const cases: Uint8Array[] = [new Uint8Array(0), new Uint8Array([1,2,3]), new TextEncoder().encode('WPILOG')]
    for (let i = 0; i < 40; i++) cases.push(good.slice(0, Math.floor(rnd() * good.length)))
    for (let i = 0; i < 60; i++) { const c = good.slice(); for (let k = 0; k < 8; k++) c[Math.floor(rnd() * c.length)] = Math.floor(rnd() * 256); cases.push(c) }
    for (let i = 0; i < 20; i++) cases.push(Uint8Array.from({ length: 500 }, () => Math.floor(rnd() * 256)))
    const bad: string[] = []
    for (const [i, c] of cases.entries()) {
      try { const s = await scanWpilog([c]); await extractSeries([c], s.entries.slice(0, 3).map((e) => e.name)) }
      catch (e) { if (!(e instanceof WpilogFormatError)) bad.push(`${i}: ${(e as Error).constructor.name} ${(e as Error).message}`) }
    }
    expect(bad).toEqual([])
  })
})
