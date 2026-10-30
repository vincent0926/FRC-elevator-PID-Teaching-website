import { describe, expect, it } from 'vitest'
import { lineCues } from './seriesStyle'

describe('lineCues：不只靠顏色分線', () => {
  it('只有一條實線：不加任何線索', () => {
    expect(lineCues([{ dash: true }, {}])).toEqual([{ dash: [6, 4] }, {}])
  })
  it('兩條實線：第二條加圓點，虛線照舊', () => {
    const c = lineCues([{ dash: true }, {}, {}])
    expect(c[0]).toEqual({ dash: [6, 4] })
    expect(c[1]).toEqual({})
    expect(c[2]).toEqual({ marker: true })
  })
  it('實線很多條：每一條的線索都不一樣（前五條）', () => {
    const c = lineCues([{}, {}, {}, {}, {}]).map((x) => JSON.stringify(x))
    expect(new Set(c).size).toBe(5)
  })
  it('實線超過五條：不會當掉', () => {
    expect(lineCues(Array.from({ length: 8 }, () => ({}))).length).toBe(8)
  })
})
