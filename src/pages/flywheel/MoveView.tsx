import { flightTime, movePose, type FlywheelSimResult, type MoveAim, type MoveOutcome, type RobotMotion, type ShotPlan } from '../../core/flywheel/flywheel'
import { moveMissText } from './flywheelTune'

/**
 * 邊移動邊射的俯視圖：右邊是目標（開口畫成圓），左邊是機器人開過去的路線。
 * 機器人的箭頭是底盤朝向（有補償時會偏），每一發從出射的位置飛到落點，進了是綠點、沒進是紅點。照比例，不計空氣阻力。
 */

const W = 640
const H = 300
const PAD = 24
const TAU = 2 * Math.PI
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function MoveView({
  result,
  plan,
  motion,
  aims,
  shots,
  tol,
  idx,
}: {
  result: FlywheelSimResult
  plan: ShotPlan
  motion: RobotMotion
  aims: MoveAim[]
  shots: MoveOutcome[]
  /** 可以射的誤差 rad/s */
  tol: number
  idx: number | null
}) {
  const last = result.t.length - 1
  const k = idx ?? last
  const now = result.t[k]
  const w = result.vel[k]
  const startT = 0
  const endT = result.t[last]
  const pose = movePose(plan, motion, now)
  const start = movePose(plan, motion, startT)
  const end = movePose(plan, motion, endT)

  // 比例尺：目標、整段路線、每一個落點都放得下
  const xs = [0, start.x, end.x, ...shots.filter((s) => Number.isFinite(s.landX)).map((s) => s.landX)]
  const ys = [0, start.y, end.y, ...shots.filter((s) => Number.isFinite(s.landY)).map((s) => s.landY)]
  const r = plan.goalWidth / 2
  const x0 = Math.min(...xs) - 0.6
  const x1 = Math.max(...xs, r) + 0.6
  const y0 = Math.min(...ys, -r) - 0.6
  const y1 = Math.max(...ys, r) + 0.6
  const s = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0))
  const ox = (W - (x1 - x0) * s) / 2
  const oy = (H - (y1 - y0) * s) / 2
  const px = (x: number) => ox + (x - x0) * s
  // 往左（y 正）畫在上面
  const py = (y: number) => oy + (y1 - y) * s

  // 現在的底盤朝向：下一發（還沒射的那一發）的偏角；都射完了就看最後一發
  const nextIdx = shots.findIndex((sh) => sh.at > now)
  const aim = aims[nextIdx === -1 ? aims.length - 1 : nextIdx]
  const heading = Math.atan2(-pose.y, -pose.x) + (aim?.yaw ?? 0)
  const RB = Math.max(6, Math.min(16, 0.4 * s))
  const target = aim?.target ?? plan.target
  const ok = Math.abs(w - target) <= tol

  const fired = shots.filter((sh) => sh.release <= now)
  const lastShot = fired.length ? fired[fired.length - 1] : null

  return (
    <div className="fw-view">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mv-view" role="img" aria-label={`邊移動邊射俯視圖：離目標 ${f(pose.distance, 2)} m，已射 ${fired.length} 發`}>
        <rect x={0} y={0} width={W} height={H} className="mv-field" />
        {/* 整段路線 */}
        <line x1={px(start.x)} y1={py(start.y)} x2={px(end.x)} y2={py(end.y)} className="mv-route" />
        {/* 目標開口 */}
        <circle cx={px(0)} cy={py(0)} r={Math.max(3, r * s)} className="mv-goal" />
        <circle cx={px(0)} cy={py(0)} r={2} className="ch-pivot" />
        {/* 每一發：出射位置 → 落點 */}
        {shots.map((sh, i) => {
          if (sh.release > now && idx !== null) return null
          const T = flightTime(sh.exit, plan.angle, plan.height, plan.goalHeight)
          const frac = idx === null || !Number.isFinite(T) ? 1 : Math.min(1, (now - sh.release) / T)
          if (!Number.isFinite(sh.landX)) return <circle key={i} cx={px(sh.pose.x)} cy={py(sh.pose.y)} r={3} className="fv-miss" />
          const bx = sh.pose.x + (sh.landX - sh.pose.x) * frac
          const by = sh.pose.y + (sh.landY - sh.pose.y) * frac
          return (
            <g key={i}>
              <line x1={px(sh.pose.x)} y1={py(sh.pose.y)} x2={px(bx)} y2={py(by)} className="mv-shot" />
              {frac >= 1 ? <circle cx={px(sh.landX)} cy={py(sh.landY)} r={4} className={sh.hit ? 'fv-hit' : 'fv-miss'} /> : <circle cx={px(bx)} cy={py(by)} r={5} className="fv-ball" />}
            </g>
          )
        })}
        {/* 機器人和底盤朝向 */}
        <g transform={`translate(${px(pose.x)} ${py(pose.y)}) rotate(${(-heading * 180) / Math.PI})`}>
          <rect x={-RB} y={-RB} width={2 * RB} height={2 * RB} rx={3} className="mv-robot" />
          <line x1={0} y1={0} x2={RB * 1.9} y2={0} className="mv-heading" />
        </g>
      </svg>
      <div className="fv-read">
        <span>
          轉速 <b>{f(w / TAU, 1)} rps</b>
          <em>（目標 {f(target / TAU, 1)}）</em>
        </span>
        <span className={ok ? 'pass' : 'fail'}>{ok ? '轉速到了' : '轉速還沒到'}</span>
        <span>
          離目標 <b>{f(pose.distance, 2)} m</b>
        </span>
        <span>
          已射 <b>{fired.length}</b> / {shots.length} 發
        </span>
        {lastShot && (
          <span>
            第 {fired.length} 發：{moveMissText(lastShot, plan.goalHeight)}
          </span>
        )}
      </div>
      <p className="small muted" style={{ margin: '4px 0 0' }}>
        從上面往下看：右邊的圓是目標開口，虛線是機器人開的路線，方塊上的線是底盤朝向。細線是每一發從出射的地方飛到掉進目標高度的地方，綠點是進了、紅點是沒進。照比例，不計空氣阻力。
      </p>
    </div>
  )
}
