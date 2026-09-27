import { useStore, type Track } from './store'

/** 進站先選機構：電梯或單關節手臂。選完才進到原本的總覽與各樓層。 */

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
    points: ['重力跟角度有關：kG·cos θ', '轉動慣量、重心距離', '1F 計算、3F 模擬可以用；2F、4F 製作中'],
  },
]

function ElevatorIcon() {
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
      <rect x="18" y="8" width="44" height="64" rx="3" className="ch-frame" />
      <rect x="26" y="16" width="28" height="44" rx="2" className="ch-stage" />
      <rect x="30" y="22" width="20" height="12" rx="2" className="ch-car" />
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
        <rect x="25" y="38" width="46" height="8" rx="3" className="ch-stage" />
        <rect x="64" y="34" width="10" height="16" rx="2" className="ch-car" />
      </g>
      <circle cx="25" cy="42" r="5" className="ch-pivot" />
    </svg>
  )
}

export function Chooser() {
  const { setTrack } = useStore()
  return (
    <div className="chooser">
      <div className="chooser-in">
        <p className="small muted" style={{ margin: 0 }}>
          FRC 9427 前饋與 PID 學習
        </p>
        <h1>你要調哪一種機構？</h1>
        <p className="lead">兩種的調參流程一樣（理論值 → 模擬 → 上機錄日誌 → 調參），差在重力怎麼算。</p>
        <div className="chooser-cards">
          {CHOICES.map((c) => (
            <button key={c.id} type="button" className="chooser-card" onClick={() => setTrack(c.id)}>
              {c.id === 'elevator' ? <ElevatorIcon /> : <ArmIcon />}
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
          ))}
        </div>
        <p className="small muted">每次打開網站都會先問；同一個分頁重新整理不用重選。進去之後，左邊導覽的「換機構」可以隨時切換，兩邊的資料分開存。</p>
      </div>
    </div>
  )
}
