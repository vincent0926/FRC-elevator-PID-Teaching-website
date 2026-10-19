import { useEffect, useState, type ReactNode } from 'react'
import { useStore, type PageId } from './store'
import { loadJson, saveJson } from '../storage/local'
import { UpdateBanner } from './UpdateBanner'
import { ErrorBoundary } from './ErrorBoundary'
import { COURSE_URL, courseChapterUrl } from '../core/deepLink'
import { t } from '../core/lang'

/** 井道導覽：樓層由下往上，黃色車廂停在目前頁面。 */

/** short：手機底部導覽用的短名稱（六個按鈕擠一排，長名稱會斷成好幾行） */
const FLOORS: { id: PageId; lv: string; name: string; short: string }[] = [
  { id: 'learn', lv: '4F', name: t('實機資料教學', 'Real-robot lessons'), short: t('實機', 'Robot') },
  { id: 'sim', lv: '3F', name: t('模擬', 'Simulate'), short: t('模擬', 'Sim') },
  { id: 'tune', lv: '2F', name: t('調參建議', 'Tuning advice'), short: t('調參', 'Tune') },
  { id: 'calc', lv: '1F', name: t('計算參數', 'Calculate gains'), short: t('計算', 'Calc') },
  { id: 'home', lv: 'G', name: t('總覽', 'Overview'), short: t('總覽', 'Home') },
]

/** 射球飛輪有的樓層 */
const FLYWHEEL_PAGES: PageId[] = ['sim', 'calc']

type Theme = 'light' | 'dark' | null

function isDark(t: Theme) {
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
}

export function Shell({ children }: { children: ReactNode }) {
  const { page: storePage, go, track, setTrack, courseChapter, pendingSection, clearPendingSection } = useStore()
  const trackName = track === 'arm' ? t('手臂', 'Arm') : track === 'flywheel' ? t('射球飛輪', 'Flywheel shooter') : t('電梯', 'Elevator')
  // 射球飛輪只有 1F 計算和 3F 模擬，其他樓層和使用說明都不顯示
  const flywheel = track === 'flywheel'
  const floors = flywheel ? FLOORS.filter((f) => FLYWHEEL_PAGES.includes(f.id)) : FLOORS
  const page = flywheel && !FLYWHEEL_PAGES.includes(storePage) ? 'calc' : storePage
  const [theme, setTheme] = useState<Theme>(() => loadJson<Theme>('theme', null))

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
    window.dispatchEvent(new Event('themechange'))
  }, [theme])


  // 深層連結的 &section=：等頁面畫出來再捲過去，<details> 順便打開
  useEffect(() => {
    if (!pendingSection) return
    const t = window.setTimeout(() => {
      const el = document.getElementById(pendingSection)
      if (el instanceof HTMLDetailsElement) el.open = true
      el?.scrollIntoView({ block: 'start' })
      clearPendingSection()
    }, 50)
    return () => window.clearTimeout(t)
  }, [page, pendingSection, clearPendingSection])

  const toggleTheme = () => {
    const next: Theme = isDark(theme) ? 'light' : 'dark'
    setTheme(next)
    saveJson('theme', next)
  }

  return (
    <>
      <UpdateBanner />
      <div className="app">
        <nav className="shaft" aria-label={t('主選單', 'Main menu')}>
          <div className="brand">
            <b>{t(`${trackName}調參工作站`, `${trackName} Tuning Station`)}</b>
            <span>{t('FRC 9427 前饋與 PID 學習', 'FRC 9427 feedforward & PID learning')}</span>
            <button className="theme-btn" type="button" style={{ marginTop: 8, display: 'block' }} onClick={() => setTrack(null)}>
              {t(`換機構（目前：${trackName}）`, `Switch mechanism (now: ${trackName})`)}
            </button>
          </div>
          <div className="floors">
            <div className="rail" aria-hidden="true" />
            {/* 樓層固定高 58px、靠下對齊，車廂從底部算第幾層就好，不必量 DOM */}
            <div className="car" aria-hidden="true" style={{ transform: `translateY(${-(floors.length - 1 - (page === 'guide' ? -1 : floors.findIndex((f) => f.id === page))) * 58}px)` }} />
            {/* 使用說明放在最上面一格：樓層是靠下對齊，加在上面不會動到原本的樓層位置；車廂從 G 往上數剛好停在這一格 */}
            {!flywheel && (
              <button type="button" className="floor" data-floor="guide" aria-current={page === 'guide' ? 'page' : undefined} onClick={() => go('guide')}>
                <span className="lv">？</span>
                <span className="nm">{t('使用說明', 'Guide')}</span>
                <span className="nm-short">{t('說明', 'Guide')}</span>
              </button>
            )}
            {floors.map((f) => (
              <button
                key={f.id}
                type="button"
                className="floor"
                data-floor={f.id}
                aria-current={page === f.id ? 'page' : undefined}
                onClick={() => go(f.id)}
              >
                <span className="lv">{f.lv}</span>
                <span className="nm">{f.name}</span>
                <span className="nm-short">{f.short}</span>
              </button>
            ))}
          </div>
          <a className="course-link" href={courseChapter !== null ? courseChapterUrl(courseChapter) : COURSE_URL}>
            {courseChapter !== null ? t(`← 回到課程第 ${courseChapter} 章`, `← Back to course chapter ${courseChapter}`) : t('FRC 9427 程式課程', 'FRC 9427 programming course')}
          </a>
          <div className="shaft-foot">
            <span>v{__APP_VERSION__}</span>
            <button className="theme-btn" type="button" onClick={toggleTheme}>
              {isDark(theme) ? t('淺色', 'Light') : t('深色', 'Dark')}
            </button>
          </div>
        </nav>
        <main>
          {courseChapter !== null && (
            <a className="course-back" href={courseChapterUrl(courseChapter)}>
              {t(`← 回到課程第 ${courseChapter} 章`, `← Back to course chapter ${courseChapter}`)}
            </a>
          )}
          <div className="track-mobile">
            <span className="small muted">{t(`${trackName}調參工作站`, `${trackName} Tuning Station`)}</span>
            <button className="track-btn" type="button" onClick={() => setTrack(null)}>
              {t('換機構', 'Switch mechanism')}
            </button>
          </div>
          <ErrorBoundary resetKey={`${track}:${page}`}>{children}</ErrorBoundary>
        </main>
      </div>
    </>
  )
}
