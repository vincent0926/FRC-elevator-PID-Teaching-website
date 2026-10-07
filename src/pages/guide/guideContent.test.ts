import { describe, expect, it } from 'vitest'
import { PAGES } from '../../app/store'
import { GUIDE_ANCHOR, guideContent, type GuideContent } from './guideContent'

const TRACKS = ['elevator', 'arm'] as const

function texts(c: GuideContent): string[] {
  return [
    c.intro,
    ...c.start.map((s) => s.text),
    ...c.sections.flatMap((s) => [s.what, ...s.steps, ...s.look, ...s.stuck.flat()]),
    ...c.terms.map((t) => t.text),
    ...c.faq.flatMap((f) => [f.q, f.a]),
  ]
}

/** 所有畫面原始碼（不含說明本身和測試）：說明裡提到的按鈕、標題要在這裡找得到 */
const SOURCES = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.ts', '!/src/pages/guide/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function uiSource(): string {
  return Object.values(SOURCES).join('\n')
}

describe.each(TRACKS)('使用說明（%s）', (track) => {
  const c = guideContent(track)

  it('每一段有唯一的 id、有效的前往頁面、有步驟', () => {
    const ids = c.sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of c.sections) {
      expect(s.id).toMatch(/^guide-/)
      expect(PAGES).toContain(s.page)
      expect(s.steps.length).toBeGreaterThan(0)
      expect(s.look.length).toBeGreaterThan(0)
    }
    for (const a of Object.values(GUIDE_ANCHOR)) expect(ids).toContain(a)
    for (const st of c.start) expect(PAGES).toContain(st.page)
  })

  it('不提已經拿掉的功能，也不提另一種機構才有的功能', () => {
    const all = texts(c).join('\n')
    expect(all).not.toMatch(/下載 Java|下載完整子系統|參數庫|匯出參數組|匯入參數組|輸出到機器人專案/)
    if (track === 'arm') expect(all).not.toMatch(/齒比怎麼選|分享這台電梯|模型校正|挑戰模式/)
    else expect(all).not.toMatch(/cos θ|CANcoder|ArmIO/)
  })

  it('說明裡「…」提到的按鈕與標題，畫面原始碼裡都找得到', () => {
    const src = uiSource()
    const quoted = new Set<string>()
    for (const t of texts(c)) for (const m of t.matchAll(/「([^」]+)」/g)) quoted.add(m[1])
    expect(quoted.size).toBeGreaterThan(10)
    const missing = [...quoted].filter((q) => !src.includes(q))
    expect(missing).toEqual([])
  })
})
