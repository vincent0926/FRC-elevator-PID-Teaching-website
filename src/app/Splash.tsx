import { useEffect, useRef } from 'react'
import { saveSession } from '../storage/local'
import { t } from '../core/lang'

/**
 * 進站第一個畫面：網站名稱，背景是比賽中的機器人照片（`public/splash/`）輪流淡入淡出，按「開始」才到選機構（決策 139）。
 * 照片載不到只會看到深色漸層，不會壞；減少動態效果時只顯示第一張；手機寬度（≤ 640px）不放照片，改彩色漸層。看過就記在這個分頁（sessionStorage `splashSeen`，App.tsx 讀），重新整理、「換機構」都不會再出現。
 */

/** 背景照片（`public/splash/` 底下），照這個順序輪播；增減張數要一起改 theme.css 的 `splash-fade` 時間。
 *  每張 6 秒；延遲先減 1.2 秒（淡入的時間），第一張一進站就是全亮 */
const SPLASH_PHOTOS = ['robot-blue.jpg', 'robot-red-1.jpg', 'robot-red-2.jpg', 'robot-red-3.jpg']

export function Splash({ onStart }: { onStart: () => void }) {
  const start = useRef<HTMLButtonElement>(null)
  useEffect(() => start.current?.focus(), [])
  const go = () => {
    saveSession('splashSeen', '1')
    onStart()
  }
  return (
    <div className="splash">
      <div className="splash-bg" aria-hidden="true">
        {SPLASH_PHOTOS.map((f, i) => (
          <span key={f} style={{ backgroundImage: `url("${import.meta.env.BASE_URL}splash/${f}")`, animationDelay: `${i * 6 - 1.2}s` }} />
        ))}
      </div>
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
