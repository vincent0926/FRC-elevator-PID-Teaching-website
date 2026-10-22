import { useEffect, useRef } from 'react'
import { saveSession } from '../storage/local'
import { t } from '../core/lang'

/**
 * 進站第一個畫面：網站名稱，背景是隊伍照片（`public/team9427.jpg`），按「開始」才到選機構（決策 139）。
 * 照片還沒放的話只會看到深色漸層，不會壞。看過就記在這個分頁（sessionStorage `splashSeen`，App.tsx 讀），重新整理、「換機構」都不會再出現。
 */

/** 背景照片放 `public/` 底下的檔名；換照片直接覆蓋這個檔 */
const SPLASH_PHOTO = 'team9427.jpg'

export function Splash({ onStart }: { onStart: () => void }) {
  const start = useRef<HTMLButtonElement>(null)
  useEffect(() => start.current?.focus(), [])
  const go = () => {
    saveSession('splashSeen', '1')
    onStart()
  }
  // CSS 變數裡的相對網址會照 theme.css 的位置（assets/）解析，所以先換成完整網址
  const photo = new URL(import.meta.env.BASE_URL + SPLASH_PHOTO, document.baseURI).href
  return (
    <div className="splash" style={{ ['--splash-photo' as string]: `url("${photo}")` }}>
      <div className="splash-in">
        <p className="splash-team">{t('前饋與 PID 學習', 'Feedforward & PID')}</p>
        <h1>{t('FRC 9427 調整參數網站', 'FRC 9427 Tuning Website')}</h1>
        <p className="splash-lead">
          {t('電梯、手臂、射球飛輪的前饋與 PID：先搞懂，再自己調好。', 'Feedforward and PID for elevators, arms and flywheel shooters: understand it first, then tune it yourself.')}
        </p>
        <button ref={start} type="button" className="btn primary splash-go" onClick={go}>
          {t('開始', 'Start')}
        </button>
      </div>
    </div>
  )
}
