import { useEffect, useRef, useState } from 'react'
import { saveFlywheelStyle } from '../pages/flywheel/flywheelStore'
import { useStore, type Track } from './store'
import { t } from '../core/lang'

/**
 * 進站先選機構：電梯、單關節手臂或射球飛輪。選完才進到各樓層（射球飛輪只有 1F、3F）。
 * 射球飛輪每次都再問一次要「彈道」（1F 算轉速和仰角 → 3F 連射模擬）、「客製化」（直接到 3F 連射模擬，自己設）
 * 還是「邊移動邊射」（1F 算補償 → 3F 邊開邊射）。
 */

const CHOICES: { id: Track; title: string; what: string; points: string[] }[] = [
  {
    id: 'elevator',
    title: t('電梯', 'Elevator'),
    what: t('直線上下的機構：串級式、連續式都可以。', 'A mechanism that moves straight up and down: cascade or continuous rigging.'),
    points: t(
      ['重力固定：kG 是常數', '串級等效質量 Σmᵢkᵢ、Σmᵢkᵢ²', '1F～4F 完整：計算、日誌診斷、模擬、實機教學'],
      ['Gravity is constant: kG is a single number', 'Cascade equivalent mass Σmᵢkᵢ, Σmᵢkᵢ²', 'Full 1F–4F: calculate, log diagnosis, simulate, real-robot lessons'],
    ),
  },
  {
    id: 'arm',
    title: t('手臂', 'Arm'),
    what: t('繞一個轉軸轉動的單關節手臂。', 'A single-joint arm that rotates about one pivot.'),
    points: t(
      ['重力跟角度有關：kG·cos θ', '轉動慣量、重心距離', '1F～4F 完整：計算參數（內建編碼器或 CANcoder）、日誌診斷、模擬、實機教學'],
      ['Gravity depends on angle: kG·cos θ', 'Moment of inertia, center-of-mass distance', 'Full 1F–4F: calculate gains (built-in encoder or CANcoder), log diagnosis, simulate, real-robot lessons'],
    ),
  },
  {
    id: 'flywheel',
    title: t('射球飛輪', 'Flywheel shooter'),
    what: t('控制轉速的射球機構：先轉到目標轉速，球打出去會掉速。', 'A speed-controlled shooter: spin up to the target speed, and it slows down each time a ball goes through.'),
    points: t(
      ['沒有重力：只有 kS、kV、kA', '速度控制（VelocityVoltage），單位就是 rps', '彈道：1F 選軌跡得到 RPS 和砲台角度 → 3F 連射', '客製化：直接連射模擬，參數自己設', '邊移動邊射：算補償，看邊開邊射進不進'],
      ['No gravity: only kS, kV, kA', 'Velocity control (VelocityVoltage), units are rps', 'Ballistic: pick a trajectory in 1F to get RPS and turret angle → rapid fire in 3F', 'Custom: go straight to the rapid-fire sim and set everything yourself', 'Shoot on the move: compute the compensation and see if shots still go in while driving'],
    ),
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
    what: t('照步驟來：在 1F 填機構和球，給離目標多遠，看每個砲台角度要幾 RPS，選一條軌跡，再到 3F 連射模擬。', 'Step by step: in 1F enter the mechanism and ball, set the distance to the target, see how many RPS each turret angle needs, pick a trajectory, then run the rapid-fire sim in 3F.'),
    start: 'calc',
  },
  {
    id: 'custom',
    title: t('客製化', 'Custom'),
    what: t('直接到 3F 連射模擬：機構、砲台角度、RPS、發數、間隔、kP 全部自己設，看轉速撐不撐得住、球進不進。', 'Go straight to the 3F rapid-fire sim: set the mechanism, turret angle, RPS, ball count, interval and kP yourself, and see whether the speed holds up and the balls go in.'),
    start: 'sim',
  },
  {
    id: 'move',
    title: t('邊移動邊射', 'Shoot on the move'),
    what: t('Shoot on the move：機器人邊開邊射，球會帶著機器人的速度。1F 算出要幾 RPS、砲台角度、底盤偏幾度，3F 看有補償和沒補償差多少。', 'The robot shoots while driving, so the ball carries the robot’s velocity. 1F works out the RPS, turret angle and how far to turn the chassis; 3F shows the difference with and without compensation.'),
    start: 'calc',
  },
] as const

function FlywheelStyleDialog({ onClose }: { onClose: () => void }) {
  const { setTrack } = useStore()
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
              className="chooser-card ch-style"
              onClick={() => {
                saveFlywheelStyle(st.id)
                setTrack('flywheel', st.start)
              }}
            >
              <b>{st.title}</b>
              <span className="small">{st.what}</span>
              <span className="btn primary small" aria-hidden="true">
                {t(`用${st.title}`, `Use ${st.title}`)}
              </span>
            </button>
          ))}
        </div>
        <p className="small muted" style={{ margin: '10px 0 0' }}>
          {t('三種用同一份機構和射球資料；要換的話，左邊導覽的「換機構」再選一次。', 'All three share the same mechanism and ball data. To switch, use “Switch mechanism” in the left navigation and choose again.')}
        </p>
        <button type="button" className="btn small" onClick={onClose}>
          {t('回去選機構', 'Back to mechanisms')}
        </button>
      </div>
    </div>
  )
}

export function Chooser() {
  const { setTrack } = useStore()
  const [fwOpen, setFwOpen] = useState(false)
  return (
    <div className="chooser">
      <div className="chooser-in">
        <p className="small muted" style={{ margin: 0 }}>
          {t('FRC 9427 前饋與 PID 學習', 'FRC 9427 feedforward & PID learning')}
        </p>
        <h1>{t('你要調哪一種機構？', 'Which mechanism are you tuning?')}</h1>
        <p className="lead">
          {t(
            '電梯和手臂是位置控制，調參流程一樣（理論值 → 模擬 → 上機錄日誌 → 調參），差在重力怎麼算。射球飛輪是速度控制，目前有計算和模擬。',
            'The elevator and arm use position control and share the same tuning flow (theory → simulation → log on the robot → tune); they differ in how gravity is handled. The flywheel shooter uses velocity control and currently has calculation and simulation.',
          )}
        </p>
        <div className="chooser-cards">
          {CHOICES.map((c) => {
            const Icon = ICONS[c.id]
            return (
            <button key={c.id} type="button" className="chooser-card" onClick={() => (c.id === 'flywheel' ? setFwOpen(true) : setTrack(c.id))}>
              <Icon />
              <b>{c.title}</b>
              <span className="small">{c.what}</span>
              <ul className="small">
                {c.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <span className="btn primary small" aria-hidden="true">
                {t(`進入${c.title}`, `Open ${c.title}`)}
              </span>
            </button>
            )
          })}
        </div>
        {fwOpen && <FlywheelStyleDialog onClose={() => setFwOpen(false)} />}
        <p className="small muted">
          {t(
            '每次打開網站都會先問；同一個分頁重新整理不用重選。進去之後，左邊導覽的「換機構」可以隨時切換，每個機構的資料分開存。',
            'You’ll be asked every time you open the site; refreshing the same tab keeps your choice. Once inside, “Switch mechanism” in the left navigation switches at any time, and each mechanism’s data is saved separately.',
          )}
        </p>
      </div>
    </div>
  )
}
