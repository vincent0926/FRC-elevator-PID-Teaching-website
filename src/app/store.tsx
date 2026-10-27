import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadSession, saveSession } from '../storage/local'
import { isBoolRecord, usePersisted } from '../storage/usePersisted'
import { SHARE_PARAM } from '../core/shareLink'
import { hasDeepLink, parseDeepLink, stripDeepLink } from '../core/deepLink'

/**
 * 全站共用狀態：選哪個機構、在哪一層樓、教學關卡、課程連結。
 * 各機構自己的資料在各自的 store（電梯 elevatorStore.tsx、手臂 armStore.tsx，共用 mechanismStore.ts 的介面），
 * 改電梯的參數不會讓手臂、射球飛輪的頁面跟著重新渲染。
 */

export type PageId = 'home' | 'calc' | 'tune' | 'sim' | 'learn' | 'guide' | 'lessons'
export const PAGES: PageId[] = ['home', 'calc', 'tune', 'sim', 'learn', 'guide', 'lessons']
/** 網站的三條線：電梯、手臂、射球飛輪（只有 3F 模擬）。null = 還沒選（每次進站都要選，同一個分頁重新整理不用重選） */
export type Track = 'elevator' | 'arm' | 'flywheel'

interface Store {
  track: Track | null
  /** first：選完要停的樓層（預設電梯、手臂是總覽，射球飛輪是 1F） */
  setTrack: (t: Track | null, first?: PageId) => void
  /** 教學關卡完成狀態（各機構共用，手臂的 key 加 arm- 前綴） */
  lessonsDone: Record<string, boolean>
  markLesson: (id: string) => void
  page: PageId
  go: (p: PageId) => void
  /** 打開使用說明並捲到某一段（section 是說明頁上的 id） */
  openGuide: (section?: string) => void
  /** 從其他頁面要求 3F 載入某個教學情境（3F 載入後清掉） */
  pendingScenario: string | null
  openScenario: (id: string | null) => void
  /** 從課程第幾章連進來（顯示回課程的連結；存在這個分頁） */
  courseChapter: number | null
  /** 深層連結要捲到的區塊 id（捲過去後清掉） */
  pendingSection: string | null
  clearPendingSection: () => void
}

const Ctx = createContext<Store | null>(null)

/** 課程網站的深層連結（?track=&scenario=&section=&from=course&ch=），打開網頁時讀一次 */
const DEEP_LINK = typeof location === 'undefined' ? {} : parseDeepLink(location.search)

function pageFromHash(): PageId {
  const h = location.hash.slice(1) as PageId
  return PAGES.includes(h) ? h : 'home'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lessonsDone, setLessonsDone] = usePersisted<Record<string, boolean>>('lessons', {}, { parse: (v) => (isBoolRecord(v) ? v : undefined) })
  const [page, setPage] = useState<PageId>(pageFromHash)
  const [pendingScenario, setPendingScenario] = useState<string | null>(DEEP_LINK.scenario ?? null)
  const [pendingSection, setPendingSection] = useState<string | null>(DEEP_LINK.section ?? null)
  const clearPendingSection = useCallback(() => setPendingSection(null), [])
  const [courseChapter] = useState<number | null>(() => {
    if (DEEP_LINK.fromChapter !== undefined) {
      saveSession('courseChapter', String(DEEP_LINK.fromChapter))
      return DEEP_LINK.fromChapter
    }
    const s = loadSession('courseChapter')
    return s !== null && /^\d+$/.test(s) ? Number(s) : null
  })
  // 分享連結是電梯的機構資料，打開時直接進電梯，不用再選（載入機構資料在 elevatorStore）
  const [track, setTrackState] = useState<Track | null>(() => {
    // 課程連結指定了機構就直接進去，並記在這個分頁
    if (DEEP_LINK.track) {
      saveSession('track', DEEP_LINK.track)
      return DEEP_LINK.track
    }
    if (new URLSearchParams(location.search).get(SHARE_PARAM)) return 'elevator'
    const t = loadSession('track')
    return t === 'elevator' || t === 'arm' || t === 'flywheel' ? t : null
  })
  // 手動選機構（或換機構）一律回到總覽：換了機構，原本停的樓層可能還沒做（例如手臂 4F）
  const setTrack = useCallback((t: Track | null, start?: PageId) => {
    setTrackState(t)
    saveSession('track', t)
    if (t) {
      // 射球飛輪沒有總覽，從 1F 開始（客製化直接到 3F）
      const first: PageId = start ?? (t === 'flywheel' ? 'calc' : 'home')
      if (location.hash !== '#' + first) location.hash = first
      setPage(first)
    }
    window.scrollTo(0, 0)
  }, [])

  // 課程深層連結：讀過就把參數拿掉，重新整理才不會又載入一次情境
  useEffect(() => {
    if (hasDeepLink(DEEP_LINK)) history.replaceState(null, '', stripDeepLink(location.href))
  }, [])

  useEffect(() => {
    const on = () => setPage(pageFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const go = useCallback((p: PageId) => {
    if (location.hash !== '#' + p) location.hash = p
    setPage(p)
    window.scrollTo(0, 0)
  }, [])

  const openGuide = useCallback(
    (section?: string) => {
      setPendingSection(section ?? null)
      go('guide')
    },
    [go],
  )

  const openScenario = useCallback(
    (id: string | null) => {
      setPendingScenario(id)
      if (id) go('sim')
    },
    [go],
  )

  const markLesson = useCallback((id: string) => setLessonsDone({ ...lessonsDone, [id]: true }), [lessonsDone, setLessonsDone])

  const value = useMemo<Store>(
    () => ({ track, setTrack, lessonsDone, markLesson, page, go, openGuide, pendingScenario, openScenario, courseChapter, pendingSection, clearPendingSection }),
    [track, setTrack, lessonsDone, markLesson, page, go, openGuide, pendingScenario, openScenario, courseChapter, pendingSection, clearPendingSection],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore 必須在 StoreProvider 裡使用')
  return s
}
