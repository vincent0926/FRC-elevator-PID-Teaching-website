import { useMemo, useState } from 'react'
import { NumberField } from '../../components/NumberField'
import {
  ballAt,
  computeFlywheelFeedforward,
  dipFraction,
  flightTime,
  GRAVITY,
  trajectoryOptions,
  wheelForGoal,
  exitRadius,
  type FlywheelMechanism,
  type ShotPlan,
  type TrajectoryOption,
} from '../../core/flywheel/flywheel'
import { BallFields, HubPreset, MechFields } from './FlywheelForms'
import type { MoveSettings } from './flywheelStore'
import { yawText } from './flywheelTune'

/**
 * 彈道 1F「算轉速和仰角」：① 基本參數 → ② 離目標多遠 → ③ 列出每個仰角要的轉速，自己選一條軌跡。
 * 選好可以直接帶到 3F 連射模擬。
 * 給 move（邊移動邊射）時多一步「機器人怎麼動」，轉速和底盤偏角加上機器人速度算。
 */

const TAU = 2 * Math.PI
const DEG = 180 / Math.PI
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')
const deg = (a: number) => Math.round(a * DEG)

export function FlywheelAim({
  mech,
  setMech,
  plan,
  setPlan,
  onSimulate,
  move,
}: {
  mech: FlywheelMechanism
  setMech: (m: FlywheelMechanism) => void
  plan: ShotPlan
  setPlan: (p: ShotPlan) => void
  /** 選好的轉速、仰角已經寫進射球資料，到 3F 連射模擬 */
  onSimulate: () => void
  /** 邊移動邊射：機器人速度 */
  move?: { settings: MoveSettings; set: (m: MoveSettings) => void }
}) {
  const setM = (p: Partial<FlywheelMechanism>) => setMech({ ...mech, ...p })
  const setP = (p: Partial<ShotPlan>) => setPlan({ ...plan, ...p })
  const ff = useMemo(() => computeFlywheelFeedforward(mech), [mech])
  const toward = move?.settings.toward ?? 0
  const side = move?.settings.side ?? 0
  const opts = useMemo(() => trajectoryOptions(mech, plan, ff.freeSpeed, undefined, { toward, side }), [mech, plan, ff.freeSpeed, toward, side])
  const setMove = (p: Partial<MoveSettings>) => move?.set({ ...move.settings, ...p })
  // 選軌跡是第幾步（邊移動邊射多一步）
  const pickStep = move ? 4 : 3
  // 選的是仰角（度）；一開始選現在射球資料用的仰角（有在清單裡的話）
  const [picked, setPicked] = useState<number | null>(() => deg(plan.angle))
  const sel = opts.find((o) => deg(o.angle) === picked && o.reachable) ?? null
  const dip = dipFraction(mech, plan.ballMass)

  const apply = (o: TrajectoryOption) => {
    setPlan({ ...plan, angle: o.angle, target: Math.round((o.wheel / TAU) * 10) * (TAU / 10) })
    onSimulate()
  }

  return (
    <div className="stack fa">
      <div className="grid2">
        <div className="panel">
          <h2>
            <span className="fa-step">1</span>基本參數：機構
          </h2>
          <MechFields mech={mech} setM={setM} />
        </div>
        <div className="panel">
          <h2>
            <span className="fa-step">1</span>基本參數：球和目標
          </h2>
          <div className="fields">
            <BallFields plan={plan} setP={setP} />
            <NumberField label="出射高度" value={plan.height} onChange={(x) => setP({ height: x })} min={0} max={2} step={0.05} unit="m" hint="離地多高" />
          </div>
          <div className="fields" style={{ marginTop: 12 }}>
            <NumberField label="目標高度" value={plan.goalHeight} onChange={(x) => setP({ goalHeight: x })} min={0} max={5} step={0.05} unit="m" hint="0 = 地面" />
            <NumberField label="開口寬度" value={plan.goalWidth} onChange={(x) => setP({ goalWidth: x })} min={0.05} max={3} step={0.05} unit="m" />
          </div>
          <HubPreset setP={setP} />
        </div>
      </div>

      <div className="panel">
        <h2>
          <span className="fa-step">2</span>離目標多遠？
        </h2>
        <div className="fields">
          <NumberField label="目標距離" value={plan.goalDistance} onChange={(x) => setP({ goalDistance: x })} min={0.2} max={20} step={0.1} unit="m" hint={move ? '射的那一刻，出射點到目標中心的水平距離' : '出射點到目標中心的水平距離'} />
        </div>
      </div>

      {move && (
        <div className="panel">
          <h2>
            <span className="fa-step">3</span>機器人怎麼動？
          </h2>
          <div className="fields">
            <NumberField label="往目標方向的速度" value={toward} onChange={(x) => setMove({ toward: x })} min={-5} max={5} step={0.1} unit="m/s" hint="往目標開是正的，往後退是負的" />
            <NumberField label="側向速度" value={side} onChange={(x) => setMove({ side: x })} min={-5} max={5} step={0.1} unit="m/s" hint="面向目標時往左開是正的，往右是負的" />
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            球離開機器人時，除了發射機構給的速度，還會帶著機器人的速度。往目標開，球本來就比較快，轉速可以低一點；往旁邊開，球會被帶著往旁邊飛，底盤要往反方向偏一點瞄（沒有砲塔，靠底盤轉）。
          </p>
        </div>
      )}

      <div className="panel">
        <h2>
          <span className="fa-step">{pickStep}</span>選一條軌跡
        </h2>
        {opts.length === 0 ? (
          <p className="fail">這個距離和高度，20°～75° 都射不進（目標太近或太高）。改距離或出射高度。</p>
        ) : (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              同一個距離，仰角不同要的轉速也不同。每條線是一個仰角剛好打到目標中心的路線{move ? '（畫的是球對地的路線，已經加上機器人速度；標的度數是發射機構的仰角）' : ''}，點一條（或下面的按鈕）看它要幾 rps。
            </p>
            <AimView plan={plan} opts={opts} sel={sel} onPick={(o) => setPicked(deg(o.angle))} />
            <div className="fa-opts" role="group" aria-label="選軌跡">
              {opts.map((o) => (
                <button
                  key={o.angle}
                  type="button"
                  className="fa-opt"
                  aria-pressed={sel === o}
                  disabled={!o.reachable}
                  onClick={() => setPicked(deg(o.angle))}
                >
                  <b>{deg(o.angle)}°</b>
                  <span>{o.reachable ? `${f(o.wheel / TAU, 1)} rps` : '轉不到'}</span>
                  <span className="small muted">{o.tolerance === null ? '±—' : `±${f(o.tolerance * 100, 1)}%`}</span>
                </button>
              ))}
            </div>
            {sel ? (
              <div className="fa-result">
                <div className="fa-big">
                  <span>
                    目標轉速 <b>{f(sel.wheel / TAU, 1)} rps</b>
                  </span>
                  <span>
                    仰角 <b>{deg(sel.angle)}°</b>
                  </span>
                  {move && (
                    <span>
                      底盤 <b>{yawText(sel.yaw)}</b>
                    </span>
                  )}
                </div>
                <dl className="fw-derived">
                  <dt>出口球速</dt>
                  <dd>
                    {f(sel.exit, 2)} m/s{move && `（相對機器人；加上機器人速度後對地 ${f(sel.fieldExit, 2)} m/s、往上 ${deg(sel.fieldAngle)}°）`}
                  </dd>
                  {move && (
                    <>
                      <dt>站著不動射</dt>
                      <dd>{stillText(mech, plan, sel)}</dd>
                    </>
                  )}
                  <dt>最高點</dt>
                  <dd>離地 {f(sel.apex, 2)} m</dd>
                  <dt>進框角度</dt>
                  <dd>往下 {f(sel.entry * DEG, 0)}°（越陡越不容易撞到開口邊）</dd>
                  <dt>轉速可以差</dt>
                  <dd>
                    {sel.tolerance === null ? '—' : `±${f(sel.tolerance * 100, 1)}%（±${f((sel.tolerance * sel.wheel) / TAU, 1)} rps）還會進`}
                  </dd>
                  <dt>一發大約掉</dt>
                  <dd>
                    {f(dip * 100, 1)}%
                    {sel.tolerance !== null && (
                      <span className={dip > sel.tolerance ? 'fail' : 'pass'}>
                        {' '}
                        {dip > sel.tolerance ? '比容許的多：下一發要等轉速回來才射' : '在容許範圍內'}
                      </span>
                    )}
                  </dd>
                </dl>
                <button className="btn primary" type="button" onClick={() => apply(sel)}>
                  {move ? '用這組到 3F 邊開邊射' : '用這組到 3F 連射模擬'}
                </button>
              </div>
            ) : (
              <p className="small">點一條軌跡看它要的轉速和仰角。</p>
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              不計空氣阻力、假設球不打滑；{move ? '機器人速度用出射那一刻的，沒算程式算完到球射出去的延遲；' : ''}轉速是打到目標中心的值，實際要上機射幾發再微調。「轉不到」是超過最高轉速的 90%；「±—」是轉速低一點球就沒辦法從上面掉進開口，容許誤差算不出來。
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** 跟站著不動射比：同一個仰角要幾 rps */
function stillText(mech: FlywheelMechanism, plan: ShotPlan, sel: TrajectoryOption): string {
  const w = wheelForGoal(exitRadius(mech), { ...plan, angle: sel.angle })
  if (w === null) return '這個仰角站著射不進'
  const diff = (sel.wheel - w) / TAU
  return `同一個仰角要 ${f(w / TAU, 1)} rps、底盤正對目標（邊移動邊射${diff >= 0 ? '多' : '少'} ${f(Math.abs(diff), 1)} rps）`
}

const W = 640
const H = 260
const GROUND = H - 22
const LX = 40

function AimView({ plan, opts, sel, onPick }: { plan: ShotPlan; opts: TrajectoryOption[]; sel: TrajectoryOption | null; onPick: (o: TrajectoryOption) => void }) {
  const xMax = (plan.goalDistance + plan.goalWidth / 2) * 1.08
  const yMax = Math.max(plan.goalHeight, plan.height, ...opts.map((o) => o.apex)) * 1.1
  const s = Math.min((W - LX - 20) / xMax, (GROUND - 12) / yMax)
  // 軌跡比較高瘦時，畫面寬度跟著縮，手機上才不會只用到一半
  const vw = Math.max(H, LX + xMax * s + 20)
  const px = (x: number) => LX + x * s
  const py = (y: number) => GROUND - (plan.height + y) * s
  const gy = GROUND - plan.goalHeight * s
  const path = (o: TrajectoryOption) => {
    const T = flightTime(o.fieldExit, o.fieldAngle, plan.height, plan.goalHeight)
    const pts: string[] = []
    for (let i = 0; i <= 40; i++) {
      const p = ballAt(o.fieldExit, o.fieldAngle, (T * i) / 40)
      pts.push(`${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`)
    }
    return pts.join(' ')
  }
  // 選到的畫在最上面
  const order = sel ? [...opts.filter((o) => o !== sel), sel] : opts
  return (
    <svg viewBox={`0 0 ${vw} ${H}`} width="100%" className="fa-view" role="img" aria-label={`${opts.length} 條候選軌跡${sel ? `，選了 ${deg(sel.angle)}°` : ''}`}>
      <rect x={0} y={GROUND} width={vw} height={H - GROUND} className="ev-base" />
      <line x1={px(plan.goalDistance + plan.goalWidth / 2)} y1={gy} x2={px(plan.goalDistance + plan.goalWidth / 2)} y2={GROUND} className="fv-goal-post" />
      <line x1={px(plan.goalDistance - plan.goalWidth / 2)} y1={gy} x2={px(plan.goalDistance + plan.goalWidth / 2)} y2={gy} className="fv-goal" />
      <line x1={LX} y1={GROUND} x2={LX} y2={py(0)} className="ev-frame" />
      {order.map((o) => (
        <g key={o.angle} className={'fa-path' + (o === sel ? ' sel' : '') + (o.reachable ? '' : ' no')} onClick={() => o.reachable && onPick(o)}>
          <polyline points={path(o)} className="fa-line" />
          {/* 比較好點的透明粗線 */}
          <polyline points={path(o)} className="fa-hit" />
          {(o === sel || deg(o.angle) % 10 === 0) && (
            <text x={px(Math.min(xMax / 1.08, (o.fieldExit * o.fieldExit * Math.sin(2 * o.fieldAngle)) / (2 * GRAVITY)))} y={py(o.apex - plan.height) - 4} className="fa-label">
              {deg(o.angle)}°
            </text>
          )}
        </g>
      ))}
      <circle cx={LX} cy={py(0)} r={4} className="ch-pivot" />
    </svg>
  )
}
