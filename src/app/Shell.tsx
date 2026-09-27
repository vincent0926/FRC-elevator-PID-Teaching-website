import { useEffect, useState, type ReactNode } from 'react'
import { useStore, type PageId } from './store'
import { loadJson, saveJson } from '../storage/local'
import { UpdateBanner } from './UpdateBanner'

/** 井道導覽：樓層由下往上，黃色車廂停在目前頁面。 */

const FLOORS: { id: PageId; lv: string; name: string }[] = [
  { id: 'learn', lv: '4F', name: '實機資料教學' },
  { id: 'sim', lv: '3F', name: '模擬' },
  { id: 'tune', lv: '2F', name: '調參建議' },
  { id: 'calc', lv: '1F', name: '計算參數' },
  { id: 'home', lv: 'G', name: '總覽' },
]

type Theme = 'light' | 'dark' | null

function isDark(t: Theme) {
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
}

export function Shell({ children }: { children: ReactNode }) {
  const { page, go } = useStore()
  const [theme, setTheme] = useState<Theme>(() => loadJson<Theme>('theme', null))

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
    window.dispatchEvent(new Event('themechange'))
  }, [theme])


  const toggleTheme = () => {
    const next: Theme = isDark(theme) ? 'light' : 'dark'
    setTheme(next)
    saveJson('theme', next)
  }

  return (
    <>
      <UpdateBanner />
      <div className="app">
        <nav className="shaft" aria-label="主選單">
          <div className="brand">
            <b>電梯調參工作站</b>
            <span>FRC 9427 前饋與 PID 學習</span>
          </div>
          <div className="floors">
            <div className="rail" aria-hidden="true" />
            {/* 樓層固定高 58px、靠下對齊，車廂從底部算第幾層就好，不必量 DOM */}
            <div className="car" aria-hidden="true" style={{ transform: `translateY(${-(FLOORS.length - 1 - FLOORS.findIndex((f) => f.id === page)) * 58}px)` }} />
            {FLOORS.map((f) => (
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
              </button>
            ))}
          </div>
          <div className="shaft-foot">
            <span>v{__APP_VERSION__}</span>
            <button className="theme-btn" type="button" onClick={toggleTheme}>
              {isDark(theme) ? '淺色' : '深色'}
            </button>
          </div>
        </nav>
        <main>{children}</main>
      </div>
    </>
  )
}
