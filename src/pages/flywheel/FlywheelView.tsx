import { useMemo } from 'react'
import {
  apexHeight,
  ballAt,
  releaseAhead,
  releaseHeight,
  CONTACT,
  flightTime,
  launchRange,
  exitSpeed,
  exitRadius,
  type FlywheelMechanism,
  type FlywheelSimResult,
  type ShotOutcome,
  type ShotPlan,
} from '../../core/flywheel/flywheel'
import { missText } from './flywheelTune'
import { t } from '../../core/lang'

/**
 * 射球飛輪側視圖：左邊是飛輪（畫面轉速放慢，輪子不照比例），右邊是球飛出去的路線和目標（照比例，不計空氣阻力）。
 * 虛線是用目標轉速射的路線；每一發往下掉經過目標高度的地方畫一個點，進了是綠色、沒進是紅色。
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

  const idealV = exitSpeed(plan.target, exitRadius(mech))
  // 比例尺：所有路線和目標都放得下
  const speeds = [idealV, ...shots.map((s) => s.exit)]
  // 出射點在量距離那一點前面 ahead、離地 rh；畫面從出射點開始，px 吃的是從量距離那一點算的距離
  const ahead = releaseAhead(plan)
  const rh = releaseHeight(plan)
  const xMax = Math.max(1, plan.goalDistance - ahead + plan.goalWidth / 2, ...speeds.map((v) => launchRange(v, plan.angle, rh))) * 1.06
  const yMax = Math.max(0.5, plan.goalHeight, ...speeds.map((v) => apexHeight(v, plan.angle, rh))) * 1.12
  const s = Math.min((W - LX - 24) / xMax, (GROUND - 18) / yMax)
  const ly = GROUND - rh * s
  const px = (x: number) => LX + (x - ahead) * s
  const py = (y: number) => ly - y * s
  // 目標：開口是一條橫線，遠的那一邊有支柱到地面
  const gy = GROUND - plan.goalHeight * s
  const g0 = px(plan.goalDistance - plan.goalWidth / 2)
  const g1 = px(plan.goalDistance + plan.goalWidth / 2)
  const dir = { x: Math.cos(plan.angle), y: -Math.sin(plan.angle) }
  // 球從輪子頂端切線方向出去：輪心在出射點的垂直下方那一側
  const cx = LX + R * Math.sin(plan.angle)
  const cy = ly + R * Math.cos(plan.angle)

  const path = (v: number, upTo: number) => {
    const T = Math.min(upTo, flightTime(v, plan.angle, rh))
    const n = 36
    const pts: string[] = []
    for (let i = 0; i <= n; i++) {
      const p = ballAt(v, plan.angle, (T * i) / n)
      pts.push(`${px(ahead + p.x).toFixed(1)},${py(p.y).toFixed(1)}`)
    }
    return pts.join(' ')
  }

  const fired = shots.filter((sh) => sh.at <= now)
  const ok = Math.abs(w - plan.target) <= tol
  const lastShot = fired.length ? fired[fired.length - 1] : null
  const status = fired.length === 0 ? (ok ? t('到速了，可以射', 'At speed, ready to shoot') : t('還沒到速', 'Not at speed yet')) : ok ? t('可以射', 'Ready to shoot') : t('掉速中，還不能射', 'Speed dropped, not ready')

  // 轉速表：0 到 1.15 倍目標
  const gw = 150
  const gx = (v: number) => 12 + (Math.max(0, Math.min(1.15, v / plan.target)) / 1.15) * gw

  return (
    <div className="fw-view">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t(`射球側視圖：轉速 ${f(w / TAU, 1)} rps，已射 ${fired.length} 發`, `Shooter side view: ${f(w / TAU, 1)} rps, ${fired.length} shots fired`)}>
        <rect x={0} y={GROUND} width={W} height={H - GROUND} className="ev-base" />
        <line x1={g1} y1={gy} x2={g1} y2={GROUND} className="fv-goal-post" />
        <line x1={g0} y1={gy} x2={g1} y2={gy} className="fv-goal" />
        {/* 用目標轉速射的路線 */}
        <polyline points={path(idealV, Infinity)} className="fv-ideal" />
        {shots.map((sh, i) => {
          if (sh.release > now && idx !== null) return null
          const tau = idx === null ? Infinity : now - sh.release
          const T = flightTime(sh.exit, plan.angle, rh)
          const Tg = flightTime(sh.exit, plan.angle, rh, plan.goalHeight)
          const p = ballAt(sh.exit, plan.angle, Math.min(tau, T))
          return (
            <g key={i}>
              <polyline points={path(sh.exit, tau)} className="fv-path" />
              {Number.isFinite(Tg) && tau >= Tg && <circle cx={px(sh.range)} cy={gy} r={4} className={sh.hit ? 'fv-hit' : 'fv-miss'} />}
              {idx !== null && tau < T && <circle cx={px(ahead + p.x)} cy={py(p.y)} r={BALL} className="fv-ball" />}
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
          {t('轉速', 'Speed')} <b>{f(w / TAU, 1)} rps</b>
          <em>{t(`（目標 ${f(plan.target / TAU, 1)}）`, ` (target ${f(plan.target / TAU, 1)})`)}</em>
        </span>
        <span className={ok ? 'pass' : 'fail'}>{status}</span>
        <span>
          {t('已射', 'Fired')} <b>{fired.length}</b> / {shots.length}{t(' 發', '')}
        </span>
        {lastShot && (
          <span>
            {t(`第 ${fired.length} 發：球速 `, `Shot ${fired.length}: ball speed `)}
            <b>{f(lastShot.exit, 2)} m/s</b>
            {t('，', ', ')}
            {missText(lastShot, plan.goalHeight)}
          </span>
        )}
      </div>
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        {t(
          <>
          上面的條是轉速，淺色區是「可以射」的範圍。右邊的橫線是目標（開口），虛線是用目標轉速射的路線，實線是每一發真的路線；球往下掉經過目標高度的地方畫一個點，綠色是進了、紅色是沒進。輪子畫面轉速放慢 {VIS_SLOW} 倍、不照比例；路線和目標照比例，不計空氣阻力。
          </>,
          <>
            The bar at the top is the wheel speed; the light band is the “ready to shoot” range. The line on the right is the target (opening), the dashed line is the path at the target speed, and the solid lines are each shot’s real path. A dot marks where the ball falls through the target height: green is in, red is a miss. The wheel’s on-screen spin is slowed {VIS_SLOW}× and not to scale; paths and the target are to scale, ignoring air drag.
          </>,
        )}
      </p>
    </div>
  )
}
