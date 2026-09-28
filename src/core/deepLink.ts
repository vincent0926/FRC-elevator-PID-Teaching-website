/**
 * 從 FRC 9427 程式課程（教學網站）連進來的深層連結。
 *
 *   ?track=elevator|arm   直接進電梯或手臂，不用先選
 *   &scenario=<情境 id>    進 3F 時直接載入這個教學情境
 *   &section=<元素 id>     捲到這個區塊（<details> 會自動打開），例如 4F 的 unit4
 *   &from=course&ch=<章>   顯示「回到課程第幾章」的連結
 *   #calc / #tune / #sim / #learn   樓層照舊用 hash
 *
 * 例：…/FRC-elevator-PID-Teaching-website/?track=elevator&scenario=noKg&from=course&ch=13#sim
 *
 * 參數只接受白名單格式，回課程的連結固定指向課程網站，不接受任意網址（避免被拿來轉址）。
 */

export const COURSE_URL = 'https://vincent0926.github.io/FRC9427teaching-website/'
export const COURSE_CHAPTERS = 20
export const DEEP_LINK_PARAMS = ['track', 'scenario', 'section', 'from', 'ch'] as const

export type DeepLinkTrack = 'elevator' | 'arm'

export interface DeepLink {
  track?: DeepLinkTrack
  scenario?: string
  section?: string
  /** 從課程第幾章連進來 */
  fromChapter?: number
}

const ID = /^[A-Za-z0-9_-]{1,40}$/

export function parseDeepLink(search: string): DeepLink {
  const q = new URLSearchParams(search)
  const out: DeepLink = {}
  const track = q.get('track')
  if (track === 'elevator' || track === 'arm') out.track = track
  const scenario = q.get('scenario')
  if (scenario && ID.test(scenario)) out.scenario = scenario
  const section = q.get('section')
  if (section && ID.test(section)) out.section = section
  const ch = q.get('ch')
  if (q.get('from') === 'course' && ch !== null && /^\d{1,2}$/.test(ch) && Number(ch) < COURSE_CHAPTERS) out.fromChapter = Number(ch)
  return out
}

export function hasDeepLink(link: DeepLink): boolean {
  return Object.keys(link).length > 0
}

/** 拿掉深層連結參數（保留其他參數與 hash），重新整理才不會重複套用 */
export function stripDeepLink(href: string): string {
  const u = new URL(href)
  for (const k of DEEP_LINK_PARAMS) u.searchParams.delete(k)
  return u.toString()
}

export function courseChapterUrl(ch: number): string {
  return `${COURSE_URL}#ch${ch}`
}
