import { useStore, type Track } from './store'

/** 進站先選機構：電梯、單關節手臂或射球飛輪。選完才進到各樓層（射球飛輪只有 1F、3F）。 */

const CHOICES: { id: Track; title: string; what: string; points: string[] }[] = [
  {
    id: 'elevator',
    title: '電梯',
    what: '直線上下的機構：串級式、連續式都可以。',
    points: ['重力固定：kG 是常數', '串級等效質量 Σmᵢkᵢ、Σmᵢkᵢ²', '1F～4F 完整：計算、日誌診斷、模擬、實機教學'],
  },
  {
    id: 'arm',
    title: '手臂',
    what: '繞一個轉軸轉動的單關節手臂。',
    points: ['重力跟角度有關：kG·cos θ', '轉動慣量、重心距離', '1F～4F 完整：計算參數（內建編碼器或 CANcoder）、日誌診斷、模擬、實機教學'],
  },
  {
    id: 'flywheel',
    title: '射球飛輪',
    what: '控制轉速的射球機構：先轉到目標轉速，球打出去會掉速。',
    points: ['沒有重力：只有 kS、kV、kA', '速度控制（VelocityVoltage），單位就是 rps', '1F 計算（球速、射程）、3F 模擬（側視動畫、到速、掉速、落點）'],
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

export function Chooser() {
  const { setTrack } = useStore()
  return (
    <div className="chooser">
      <div className="chooser-in">
        <p className="small muted" style={{ margin: 0 }}>
          FRC 9427 前饋與 PID 學習
        </p>
        <h1>你要調哪一種機構？</h1>
        <p className="lead">電梯和手臂是位置控制，調參流程一樣（理論值 → 模擬 → 上機錄日誌 → 調參），差在重力怎麼算。射球飛輪是速度控制，目前有計算和模擬。</p>
        <div className="chooser-cards">
          {CHOICES.map((c) => {
            const Icon = ICONS[c.id]
            return (
            <button key={c.id} type="button" className="chooser-card" onClick={() => setTrack(c.id)}>
              <Icon />
              <b>{c.title}</b>
              <span className="small">{c.what}</span>
              <ul className="small">
                {c.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <span className="btn primary small" aria-hidden="true">
                進入{c.title}
              </span>
            </button>
            )
          })}
        </div>
        <p className="small muted">每次打開網站都會先問；同一個分頁重新整理不用重選。進去之後，左邊導覽的「換機構」可以隨時切換，每個機構的資料分開存。</p>
      </div>
    </div>
  )
}
