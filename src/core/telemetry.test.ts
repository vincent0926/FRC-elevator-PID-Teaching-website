import { describe, expect, it } from 'vitest'
import { cleanPath, countUrl, feedbackUrl, shouldCount, type CountEnv, type TelemetryConfig } from './telemetry'

const cfg: TelemetryConfig = { goatcounter: 'demo', host: 'example.github.io', formUrl: '', formInfoEntry: '', repo: 'me/site' }
const env: CountEnv = { hostname: 'example.github.io', webdriver: false, optedOut: false, doNotTrack: false }
const ctx = { version: '1.2.3', track: 'elevator', page: 'sim', lang: 'zh' as const }

describe('shouldCount', () => {
  it('設定好、在正式網域、沒關掉才統計', () => {
    expect(shouldCount(cfg, env)).toBe(true)
  })
  it('沒設 GoatCounter 代號就不統計', () => {
    expect(shouldCount({ ...cfg, goatcounter: '' }, env)).toBe(false)
  })
  it('本機、自動化瀏覽器、使用者關掉、Do Not Track 都不統計', () => {
    expect(shouldCount(cfg, { ...env, hostname: 'localhost' })).toBe(false)
    expect(shouldCount(cfg, { ...env, webdriver: true })).toBe(false)
    expect(shouldCount(cfg, { ...env, optedOut: true })).toBe(false)
    expect(shouldCount(cfg, { ...env, doNotTrack: true })).toBe(false)
  })
})

describe('cleanPath', () => {
  it('只留英數、-、/', () => {
    expect(cleanPath('/Elevator/2F Read?x=1')).toBe('elevator/2f-read-x-1')
    expect(cleanPath('//a//b//')).toBe('a/b')
  })
  it('太長截斷', () => {
    expect(cleanPath('a'.repeat(200)).length).toBe(80)
  })
})

describe('countUrl', () => {
  it('瀏覽頁面：路徑前面加 /', () => {
    const u = new URL(countUrl('demo', { path: 'elevator/sim', event: false, rnd: 'x' }))
    expect(u.origin).toBe('https://demo.goatcounter.com')
    expect(u.pathname).toBe('/count')
    expect(u.searchParams.get('p')).toBe('/elevator/sim')
    expect(u.searchParams.get('e')).toBeNull()
  })
  it('動作：e=true、帶畫面大小', () => {
    const u = new URL(countUrl('demo', { path: 'arm/2f-read-file', event: true, screen: { width: 390.4, height: 844, dpr: 3 }, rnd: 'x' }))
    expect(u.searchParams.get('p')).toBe('arm/2f-read-file')
    expect(u.searchParams.get('e')).toBe('true')
    expect(u.searchParams.get('s')).toBe('390,844,3')
  })
})

describe('feedbackUrl', () => {
  it('沒設表單：開 GitHub Issue，內文帶網站資訊', () => {
    const u = new URL(feedbackUrl(cfg, ctx))
    expect(u.href.startsWith('https://github.com/me/site/issues/new?')).toBe(true)
    expect(u.searchParams.get('title')).toBe('[反饋] ')
    expect(u.searchParams.get('body')).toContain('v1.2.3 · elevator · sim · zh')
  })
  it('英文版的 Issue 內文是英文', () => {
    const u = new URL(feedbackUrl(cfg, { ...ctx, lang: 'en', track: null, page: 'home' }))
    expect(u.searchParams.get('body')).toContain('Site info: v1.2.3 · chooser · home · en')
  })
  it('有表單：自動帶入網站資訊那一題', () => {
    const u = new URL(feedbackUrl({ ...cfg, formUrl: 'https://docs.google.com/forms/d/e/abc/viewform', formInfoEntry: 'entry.42' }, ctx))
    expect(u.pathname).toBe('/forms/d/e/abc/viewform')
    expect(u.searchParams.get('usp')).toBe('pp_url')
    expect(u.searchParams.get('entry.42')).toBe('v1.2.3 · elevator · sim · zh')
  })
  it('有表單但沒給 entry：直接開表單', () => {
    expect(feedbackUrl({ ...cfg, formUrl: 'https://docs.google.com/forms/d/e/abc/viewform' }, ctx)).toBe('https://docs.google.com/forms/d/e/abc/viewform')
  })
})
