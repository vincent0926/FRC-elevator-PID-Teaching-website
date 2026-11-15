import { useEffect, useRef, useState } from 'react'
import { saveFlywheelStyle } from '../pages/flywheel/flywheelStore'
import { SiteFooter } from './SiteFooter'
import { countEvent } from './telemetry'
import { useStore, type Track } from './store'
import { t } from '../core/lang'
import { Doors } from './Doors'
import { DOOR_CLOSE_MS, PICK_MS, afterMotion } from './motion'

/**
 * 進站先選機構：電梯、單關節手臂或射球飛輪。選完才進到各樓層（射球飛輪只有 1F、3F）。
 * 射球飛輪每次都再問一次要「彈道」（1F 算轉速和仰角 → 3F 連射模擬）、「客製化」（直接到 3F 連射模擬，自己設）
 * 還是「邊移動邊射」（1F 算補償 → 3F 邊開邊射）。
 * 進來時電梯門滑開；點了之後選到的卡片彈一下、其他變淡，接著門關上才進樓層（決策 147）。
 */

/** 點了卡片之後：先彈一下、門關上，才真的換頁；過場中再點不理 */
function usePick() {
  const [picked, setPicked] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const pick = (id: string, go: () => void) => {
    if (picked) return
    setPicked(id)
    afterMotion(PICK_MS, () => {
      setClosing(true)
      afterMotion(DOOR_CLOSE_MS, go)
    })
  }
  const cls = (id: string, base: string) => (picked === null ? base : `${base} ${picked === id ? 'picked' : 'dimmed'}`)
  return { picked, closing, pick, cls }
}

const CHOICES: { id: Track; title: string; what: string }[] = [
  {
    id: 'elevator',
    title: t('電梯', 'Elevator'),
    what: t('直線上下的機構：串級式、連續式都可以。', 'A mechanism that moves straight up and down: cascade or continuous rigging.'),
  },
  {
    id: 'arm',
    title: t('手臂', 'Arm'),
    what: t('繞一個轉軸轉動的單關節手臂。', 'A single-joint arm that rotates about one pivot.'),
  },
  {
    id: 'flywheel',
    title: t('射球飛輪', 'Flywheel shooter'),
    what: t('控制轉速的射球機構，球打出去會掉速。', 'A speed-controlled shooter that slows down with every shot.'),
  },
]

function ElevatorIcon() {
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
      <rect x="18" y="8" width="44" height="64" rx="3" className="ch-frame" />
      {/* 滑過卡片時中間那級和托架上下動（CSS 動畫，托架跑兩倍距離，跟串級式一樣） */}
      <rect x="26" y="16" width="28" height="44" rx="2" className="ch-stage ch-stage-move" />
      <rect x="30" y="44" width="20" height="12" rx="2" className="ch-car ch-car-move" />
      <rect x="10" y="72" width="60" height="4" className="ch-base" />
    </svg>
  )
}

function ArmIcon() {
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
      <rect x="10" y="72" width="60" height="4" className="ch-base" />
      <rect x="20" y="40" width="10" height="32" className="ch-frame" />
      <g transform="rotate(-35 25 42)">
        {/* 滑過卡片時繞轉軸轉一下 */}
        <g className="ch-arm-swing">
          <rect x="25" y="38" width="46" height="8" rx="3" className="ch-stage" />
          <rect x="64" y="34" width="10" height="16" rx="2" className="ch-car" />
        </g>
      </g>
      <circle cx="25" cy="42" r="5" className="ch-pivot" />
    </svg>
  )
}

function FlywheelIcon() {
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
      <rect x="10" y="72" width="60" height="4" className="ch-base" />
      <path d="M14 68 L14 30 Q14 12 34 12 L66 12" className="ch-frame" />
      {/* 滑過卡片時輪子轉起來 */}
      <g className="ch-wheel-spin">
        <circle cx="34" cy="40" r="16" className="ch-stage" />
        <rect x="32" y="24" width="4" height="10" className="ch-car" />
      </g>
      <circle cx="34" cy="40" r="4" className="ch-pivot" />
      <circle cx="60" cy="22" r="7" className="ch-car" />
    </svg>
  )
}

const ICONS = { elevator: ElevatorIcon, arm: ArmIcon, flywheel: FlywheelIcon }

/** 射球飛輪的三種進法（存在這個分頁，見 flywheelStore 的 FlywheelStyle） */
const FLYWHEEL_STYLES = [
  {
    id: 'ballistic',
    title: t('彈道', 'Ballistic'),
    what: t('1F 算轉速和砲台角度，再到 3F 連射。', 'Work out RPS and turret angle in 1F, then rapid-fire in 3F.'),
    start: 'calc',
  },
  {
    id: 'custom',
    title: t('客製化', 'Custom'),
    what: t('直接到 3F 連射模擬，參數自己設。', 'Go straight to the 3F rapid-fire sim and set everything yourself.'),
    start: 'sim',
  },
  {
    id: 'move',
    title: t('邊移動邊射', 'Shoot on the move'),
    what: t('機器人邊開邊射，算出要怎麼補償。', 'Shoot while driving and work out the compensation.'),
    start: 'calc',
  },
] as const

function FlywheelStyleDialog({ onClose }: { onClose: () => void }) {
  const { setTrack } = useStore()
  const { closing, pick, cls } = usePick()
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="ch-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ch-dialog" role="dialog" aria-modal="true" aria-labelledby="ch-fw-title">
        <h2 id="ch-fw-title">{t('射球飛輪：你想怎麼用？', 'Flywheel shooter: how do you want to use it?')}</h2>
        <div className="ch-styles">
          {FLYWHEEL_STYLES.map((st, i) => (
            <button
              key={st.id}
              ref={i === 0 ? first : undefined}
              type="button"
              className={cls(st.id, 'chooser-card ch-style')}
              onClick={() =>
                pick(st.id, () => {
                  saveFlywheelStyle(st.id)
                  countEvent(`flywheel-${st.id}`)
                  setTrack('flywheel', st.start)
                })
              }
            >
              <b>{st.title}</b>
              <span className="small">{st.what}</span>
              <span className="btn primary small" aria-hidden="true">
                {t(`用${st.title}`, `Use ${st.title}`)}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="btn small" onClick={onClose}>
          {t('回去選機構', 'Back to mechanisms')}
        </button>
      </div>
      {closing && <Doors closing />}
    </div>
  )
}

/** `fromSplash`：剛按完「開始」，門上的隊號先淡掉再開門（決策 148） */
export function Chooser({ fromSplash = false }: { fromSplash?: boolean }) {
  const { setTrack } = useStore()
  const [fwOpen, setFwOpen] = useState(false)
  const { closing, pick, cls } = usePick()
  return (
    <div className="chooser">
      <Doors closing={closing} sign={fromSplash && !closing} />
      <div className="chooser-in">
        <h1>{t('你要調哪一種機構？', 'Which mechanism are you tuning?')}</h1>
        <p className="lead">{t('電梯、手臂是位置控制，射球飛輪是速度控制。', 'The elevator and arm use position control; the flywheel shooter uses velocity control.')}</p>
        <div className="chooser-cards">
          {CHOICES.map((c) => {
            const Icon = ICONS[c.id]
            return (
            <button
              key={c.id}
              type="button"
              className={cls(c.id, 'chooser-card')}
              onClick={() => (c.id === 'flywheel' ? setFwOpen(true) : pick(c.id, () => setTrack(c.id)))}
            >
              <Icon />
              <b>{c.title}</b>
              <span className="small">{c.what}</span>
              <span className="btn primary small" aria-hidden="true">
                {t(`進入${c.title}`, `Open ${c.title}`)}
              </span>
            </button>
            )
          })}
        </div>
        {fwOpen && <FlywheelStyleDialog onClose={() => setFwOpen(false)} />}
        <SiteFooter track={null} page="chooser" />
      </div>
    </div>
  )
}
