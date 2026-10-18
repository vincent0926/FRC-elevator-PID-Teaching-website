import { useMemo } from 'react'
import {
  ballAt,
  CONTACT,
  flightTime,
  launchRange,
  exitSpeed,
  type FlywheelMechanism,
  type FlywheelSimResult,
  type ShotOutcome,
  type ShotPlan,
} from '../../core/flywheel/flywheel'

/**
 * 射球飛輪側視圖：左邊是飛輪（畫面轉速放慢，輪子不照比例），右邊是球飛出去的路線（照比例，不計空氣阻力）。
 * 虛線是用目標轉速射的路線；每一發實際的路線和落點畫在上面，掉速的那發會落在虛線前面。
 */

const W = 640
const H = 260
const GROUND = H - 22
const LX = 70
const R = 18
const BALL = 6
/** 真的 50 rps 畫出來只會看到輪子亂閃，畫面上放慢 20 倍 */
const VIS_SLOW = 20
const TAU = 2 * Math.PI
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function FlywheelView({
  result,
  mech,
  plan,
  tol,
  shots,
  idx,
}: {
  result: FlywheelSimResult
  mech: FlywheelMechanism
  plan: ShotPlan
  /** 可以射的誤差 rad/s */
  tol: number
  shots: ShotOutcome[]
  idx: number | null
}) {
  const last = result.t.length - 1
  const k = idx ?? last
  const now = result.t[k]
  const w = result.vel[k]

  // 輪子轉過的角度（畫面用）
  const turn = useMemo(() => {
    const out = new Float64Array(result.t.length)
    for (let i = 1; i < out.length; i++) out[i] = out[i - 1] + result.vel[i - 1] * (result.t[i] - result.t[i - 1])
    return out
  }, [result])

  const idealV = exitSpeed(plan.target, mech.wheelRadius)
  const idealRange = launchRange(idealV, plan.angle, plan.height)
  // 比例尺：所有路線都放得下
  const speeds = [idealV, ...shots.map((s) => s.exit)]
  const xMax = Math.max(1, ...speeds.map((v) => launchRange(v, plan.angle, plan.height))) * 1.06
  const yMax = Math.max(0.5, ...speeds.map((v) => plan.height + (v * Math.sin(plan.angle)) ** 2 / (2 * 9.81))) * 1.12
  const s = Math.min((W - LX - 24) / xMax, (GROUND - 18) / yMax)
  const ly = GROUND - plan.height * s
  const px = (x: number) => LX + x * s
  const py = (y: number) => ly - y * s
  const dir = { x: Math.cos(plan.angle), y: -Math.sin(plan.angle) }
  // 球從輪子頂端切線方向出去：輪心在出射點的垂直下方那一側
  const cx = LX + R * Math.sin(plan.angle)
  const cy = ly + R * Math.cos(plan.angle)

  const path = (v: number, upTo: number) => {
    const T = Math.min(upTo, flightTime(v, plan.angle, plan.height))
    const n = 36
    const pts: string[] = []
    for (let i = 0; i <= n; i++) {
      const p = ballAt(v, plan.angle, (T * i) / n)
      pts.push(`${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`)
    }
    return pts.join(' ')
  }

  const fired = shots.filter((sh) => sh.at <= now)
  const ok = Math.abs(w - plan.target) <= tol
  const lastShot = fired.length ? fired[fired.length - 1] : null
  const status = fired.length === 0 ? (ok ? '到速了，可以射' : '還沒到速') : ok ? '可以射' : '掉速中，還不能射'

  // 轉速表：0 到 1.15 倍目標
  const gw = 150
  const gx = (v: number) => 12 + (Math.max(0, Math.min(1.15, v / plan.target)) / 1.15) * gw

  return (
    <div className="fw-view">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`射球側視圖：轉速 ${f(w / TAU, 1)} rps，已射 ${fired.length} 發`}>
        <rect x={0} y={GROUND} width={W} height={H - GROUND} className="ev-base" />
        {/* 用目標轉速射的路線 */}
        <polyline points={path(idealV, Infinity)} className="fv-ideal" />
        <line x1={px(idealRange)} y1={GROUND - 10} x2={px(idealRange)} y2={GROUND} className="fv-ideal-tick" />
        {shots.map((sh, i) => {
          if (sh.release > now && idx !== null) return null
          const tau = idx === null ? Infinity : now - sh.release
          const T = flightTime(sh.exit, plan.angle, plan.height)
          const p = ballAt(sh.exit, plan.angle, Math.min(tau, T))
          return (
            <g key={i}>
              <polyline points={path(sh.exit, tau)} className="fv-path" />
              {tau >= T && <circle cx={px(sh.exit * Math.cos(plan.angle) * T)} cy={GROUND - 2} r={3} className="fv-land" />}
              {idx !== null && tau < T && <circle cx={px(p.x)} cy={py(p.y)} r={BALL} className="fv-ball" />}
            </g>
          )
        })}
        {/* 球碰著輪子的 30 ms */}
        {idx !== null &&
          shots.map((sh, i) =>
            now >= sh.at && now < sh.release ? <circle key={i} cx={LX - dir.x * R * (1 - (now - sh.at) / CONTACT)} cy={ly - dir.y * R * (1 - (now - sh.at) / CONTACT)} r={BALL} className="fv-ball" /> : null,
          )}
        <line x1={cx} y1={cy} x2={cx} y2={GROUND} className="ev-frame" />
        <g transform={`rotate(${(((turn[k] / VIS_SLOW) * 180) / Math.PI) % 360} ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={R} className="fv-wheel" />
          {[0, 1, 2].map((j) => (
            <line key={j} x1={cx} y1={cy} x2={cx + R * Math.cos((j * TAU) / 3)} y2={cy + R * Math.sin((j * TAU) / 3)} className="fv-spoke" />
          ))}
          <circle cx={cx + R - 4} cy={cy} r={3} className="fv-mark" />
        </g>
        <circle cx={cx} cy={cy} r={3} className="ch-pivot" />
        {/* 轉速表 */}
        <rect x={12} y={12} width={gw} height={10} rx={2} className="fv-gauge-bg" />
        <rect x={gx(plan.target - tol)} y={10} width={Math.max(2, gx(plan.target + tol) - gx(plan.target - tol))} height={14} className="fv-gauge-tol" />
        <rect x={12} y={14} width={Math.max(0, gx(w) - 12)} height={6} rx={1} className={ok ? 'fv-gauge-ok' : 'fv-gauge-low'} />
        <line x1={gx(plan.target)} y1={8} x2={gx(plan.target)} y2={26} className="fv-gauge-target" />
      </svg>
      <div className="fv-read">
        <span>
          轉速 <b>{f(w / TAU, 1)} rps</b>
          <em>（目標 {f(plan.target / TAU, 1)}）</em>
        </span>
        <span className={ok ? 'pass' : 'fail'}>{status}</span>
        <span>
          已射 <b>{fired.length}</b> / {shots.length} 發
        </span>
        {lastShot && (
          <span>
            第 {fired.length} 發：球速 <b>{f(lastShot.exit, 2)} m/s</b>，落點 <b>{f(lastShot.range, 2)} m</b>
            <em>（{lastShot.miss >= 0 ? '遠' : '近'} {f(Math.abs(lastShot.miss) * 100, 0)} cm）</em>
          </span>
        )}
      </div>
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        上面的條是轉速，淺色區是「可以射」的範圍。虛線是用目標轉速射的路線（直線短標是落點），實線是每一發真的路線。輪子畫面轉速放慢 {VIS_SLOW} 倍、不照比例；路線照比例，不計空氣阻力。
      </p>
    </div>
  )
}
