import { describe, expect, it } from 'vitest'
import { decodeMechanism, encodeMechanism, shareUrl } from './shareLink'
import { DEFAULT_MECHANISM } from '../schema/parameterSet'

describe('分享機構連結', () => {
  it('編碼再解碼得到一樣的機構資料，網址安全（沒有 + / =）', () => {
    const m = { ...DEFAULT_MECHANISM, payloadMass: 2.345, name: '9427 電梯 ✓' }
    const s = encodeMechanism(m)
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    const r = decodeMechanism(s)
    expect(r.ok && r.value).toEqual(m)
  })
  it('壞掉或格式不對的資料不載入', () => {
    expect(decodeMechanism('!!!').ok).toBe(false)
    expect(decodeMechanism(encodeMechanism(DEFAULT_MECHANISM).slice(0, 20)).ok).toBe(false)
    const bad = btoa(JSON.stringify({ gearRatio: 'x' })).replace(/=+$/, '')
    expect(decodeMechanism(bad).ok).toBe(false)
  })
  it('分享網址保留路徑、換掉舊的查詢字串、頁面到 1F', () => {
    const u = new URL(shareUrl('https://x.github.io/elevator/?m=old#sim', DEFAULT_MECHANISM))
    expect(u.pathname).toBe('/elevator/')
    expect(u.hash).toBe('#calc')
    expect(decodeMechanism(u.searchParams.get('m')!).ok).toBe(true)
  })
})
