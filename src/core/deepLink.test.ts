import { describe, expect, it } from 'vitest'
import { COURSE_URL, courseChapterUrl, hasDeepLink, parseDeepLink, stripDeepLink } from './deepLink'

describe('課程深層連結', () => {
  it('讀出機構、情境、區塊與來源章節', () => {
    expect(parseDeepLink('?track=arm&scenario=noKg&section=unit4&from=course&ch=13')).toEqual({
      track: 'arm',
      scenario: 'noKg',
      section: 'unit4',
      fromChapter: 13,
    })
  })
  it('不合法的值一律忽略，不會拿來用', () => {
    expect(parseDeepLink('?track=robot&scenario=<script>&section=a%20b&from=course&ch=99')).toEqual({})
    expect(parseDeepLink('?from=evil&ch=3')).toEqual({})
    expect(parseDeepLink('?from=course&ch=-1')).toEqual({})
    expect(hasDeepLink(parseDeepLink(''))).toBe(false)
  })
  it('拿掉深層連結參數，保留分享參數與 hash', () => {
    expect(stripDeepLink('https://x.io/site/?track=arm&m=abc&ch=3&from=course#sim')).toBe('https://x.io/site/?m=abc#sim')
  })
  it('回課程的連結固定指向課程網站', () => {
    expect(courseChapterUrl(13)).toBe(COURSE_URL + '#ch13')
  })
})
