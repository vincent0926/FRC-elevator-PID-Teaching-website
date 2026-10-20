import { useMemo, useState } from 'react'
import { NumberField } from '../../components/NumberField'
import {
  ballAt,
  computeFlywheelFeedforward,
  DEFAULT_LIMIT_FRACTION,
  dipFraction,
  flightTime,
  GRAVITY,
  trajectoryOptions,
  wheelForGoal,
  wheelLimit,
  turretDeg,
  exitRadius,
  releaseAhead,
  releaseHeight,
  moveFixes,
  moveWindow,
  NARROW_WINDOW,
  type AimWindow,
  type MoveFix,
  type FlywheelMechanism,
  type ShotPlan,
  type TrajectoryOption,
} from '../../core/flywheel/flywheel'
import { MOVE_SHOT_USAGE, moveShotJava } from '../../core/codegen/flywheel'
import { BallFields, distanceHint, GoalDistanceField, HubPreset, MechFields, TurretFields } from './FlywheelForms'
import { useRpsLimit, type MoveSettings } from './flywheelStore'
import { yawText } from './flywheelTune'
import { t } from '../../core/lang'

/**
 * 彈道 1F「算轉速和仰角」：① 基本參數 → ② 離目標多遠 → ③ 列出每個仰角要的轉速，自己選一條軌跡。
 * 選好可以直接帶到 3F 連射模擬。
 * 給 move（邊移動邊射）時多一步「機器人怎麼動」，轉速和底盤偏角加上機器人速度算。
 */

const TAU = 2 * Math.PI
const DEG = 180 / Math.PI
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')
// 畫面上的角度都是砲台角度（正上方 0°、往目標倒角度變大、水平朝目標 90°，見 turretDeg）；到 0.1°：範圍很窄時會有小數
const deg = (a: number) => Math.round(turretDeg(a) * 10) / 10
/** 仰角範圍 lo～hi（rad）換成砲台角度，小的在前 */
const span = (lo: number, hi: number) => `${deg(hi)}°${t('～', '–')}${deg(lo)}°`

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
  const [limit, setLimit] = useRpsLimit()
  const maxWheel = wheelLimit(ff.freeSpeed, limit.rps)
  const opts = useMemo(() => trajectoryOptions(mech, plan, maxWheel, undefined, { toward, side }), [mech, plan, maxWheel, toward, side])
  const noneOk = opts.length > 0 && opts.every((o) => !o.reachable)
  // 邊移動邊射：能打進的仰角範圍太窄（或沒有）就給參數修正意見
  const win = useMemo(() => (move ? moveWindow(exitRadius(mech), plan, { toward, side }, maxWheel, Math.PI / 1800) : null), [move, mech, plan, toward, side, maxWheel])
  const narrow = !!move && (win === null || win.width < NARROW_WINDOW)
  const fixes = useMemo(
    () => (narrow ? moveFixes(mech, plan, { toward, side }, maxWheel, ff.freeSpeed * DEFAULT_LIMIT_FRACTION) : []),
    [narrow, mech, plan, toward, side, maxWheel, ff.freeSpeed],
  )
  const applyFix = (x: MoveFix) => {
    if (x.param === 'toward') setMove({ toward: x.value })
    else if (x.param === 'side') setMove({ side: x.value })
    else if (x.param === 'distance') setP({ goalDistance: x.value })
    else setLimit({ rps: Math.round(x.value / TAU) })
  }
  // 每 5° 找到太少、改成每 1° 找的（有不是 5 的倍數的仰角）
  const fine = opts.some((o) => deg(o.angle) % 5 !== 0)
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
            <span className="fa-step">1</span>{t('基本參數：機構', 'Basics: mechanism')}
          </h2>
          <MechFields mech={mech} setM={setM} />
          <div className="fields" style={{ marginTop: 12 }}>
            <NumberField
              label={t('轉速上限', 'Speed limit')}
              value={limit.rps}
              onChange={(x) => setLimit({ rps: Math.max(0, x) })}
              min={0}
              max={300}
              step={1}
              unit="rps"
              hint={limitHint(limit.rps, ff.freeSpeed)}
            />
          </div>
        </div>
        <div className="panel">
          <h2>
            <span className="fa-step">1</span>{t('基本參數：球和目標', 'Basics: ball and target')}
          </h2>
          <div className="fields">
            <BallFields plan={plan} setP={setP} />
          </div>
          <div className="fields" style={{ marginTop: 12 }}>
            <NumberField label={t('目標高度', 'Target height')} value={plan.goalHeight} onChange={(x) => setP({ goalHeight: x })} min={0} max={5} step={0.05} unit="m" hint={t('0 = 地面', '0 = floor')} />
            <NumberField label={t('開口寬度', 'Opening width')} value={plan.goalWidth} onChange={(x) => setP({ goalWidth: x })} min={0.05} max={3} step={0.05} unit="m" />
          </div>
          <HubPreset setP={setP} />
        </div>
      </div>

      <div className="panel">
        <h2>
          <span className="fa-step">2</span>{t('離目標多遠？', 'How far is the target?')}
        </h2>
        <div className="fields">
          <GoalDistanceField plan={plan} setP={setP} fromTag={!move} hint={distanceHint(plan)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <TurretFields plan={plan} setP={setP} angle={sel?.angle} />
        </div>
      </div>

      {move && (
        <div className="panel">
          <h2>
            <span className="fa-step">3</span>{t('機器人怎麼動？', 'How is the robot moving?')}
          </h2>
          <div className="fields">
            <NumberField label={t('往目標方向的速度', 'Speed toward the target')} value={toward} onChange={(x) => setMove({ toward: x })} min={-5} max={5} step={0.1} unit="m/s" hint={t('往目標開是正的，往後退是負的', 'Positive driving toward the target, negative backing away')} />
            <NumberField label={t('側向速度', 'Sideways speed')} value={side} onChange={(x) => setMove({ side: x })} min={-5} max={5} step={0.1} unit="m/s" hint={t('面向目標時往左開是正的，往右是負的', 'Facing the target, driving left is positive, right is negative')} />
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {t(
              '球離開機器人時，除了發射機構給的速度，還會帶著機器人的速度。往目標開，球本來就比較快，轉速可以低一點；往旁邊開，球會被帶著往旁邊飛，底盤要往反方向偏一點瞄（沒有砲塔，靠底盤轉）。',
              'When the ball leaves the robot it carries the robot’s velocity on top of what the shooter gives it. Driving toward the target, the ball is already faster, so the wheel can spin a bit slower. Driving sideways, the ball gets carried sideways, so the chassis has to aim a little the other way (no turret: the chassis turns).',
            )}
          </p>
        </div>
      )}

      <div className="panel">
        <h2>
          <span className="fa-step">{pickStep}</span>{t('選一條軌跡', 'Pick a trajectory')}
        </h2>
        {narrow && <FixAdvice win={win} fixes={fixes} values={{ toward, side, distance: plan.goalDistance, limit: maxWheel }} onApply={applyFix} />}
        {opts.length === 0 ? (
          <p className="fail">
            {move
              ? t('這個距離、高度和機器人速度，砲台角度 5°～80° 都射不進（目標太近、太高，或機器人開太快）。改距離、砲台轉軸高度或機器人速度。', 'At this distance, height and robot speed, no turret angle from 5° to 80° goes in (target too close or too high, or the robot is too fast). Change the distance, turret pivot height or robot speed.')
              : t('這個距離和高度，砲台角度 5°～80° 都射不進（目標太近或太高）。改距離或砲台轉軸高度。', 'At this distance and height, no turret angle from 5° to 80° goes in (target too close or too high). Change the distance or turret pivot height.')}
          </p>
        ) : (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              {t(
                <>
                  同一個距離，砲台角度不同要的轉速也不同。每條線是一個砲台角度剛好打到目標中心的路線{move ? '（畫的是球對地的路線，已經加上機器人速度；標的度數是發射機構的砲台角度）' : ''}，點一條（或下面的按鈕）看它要幾 rps。砲台角度：球往正上方是 0°，往目標倒角度變大，水平朝目標是 90°。
                </>,
                <>
                  At the same distance, each turret angle needs a different speed. Each line is the path that hits the target center at one turret angle{move ? ' (drawn relative to the field, with the robot’s velocity added; the labels are the shooter’s turret angle)' : ''}. Click one (or a button below) to see how many rps it needs. Turret angle: straight up is 0°, it grows as the shooter tips toward the target, and horizontal toward the target is 90°.
                </>,
              )}
            </p>
            {fine && !narrow && (
              <p className="small muted">
                {t(
                  <>
                    {move ? '機器人開得快，' : ''}能打進{noneOk ? '' : '、轉速又在上限內'}的砲台角度只剩 {span(opts[0].angle, opts[opts.length - 1].angle)}，每 5° 找不到幾條，所以改成每 0.1° 找，從這個範圍平均挑 {opts.length} 條給你選。範圍越窄，角度差一點就打不進。
                  </>,
                  <>
                    {move ? 'The robot is moving fast, so the ' : 'The '}turret angles that go in{noneOk ? '' : ' within the speed limit'} are only {span(opts[0].angle, opts[opts.length - 1].angle)}. Searching every 5° finds too few, so it searches every 0.1° and picks {opts.length} evenly spread across that range. The narrower the range, the less angle error it takes to miss.
                  </>,
                )}
              </p>
            )}
            {noneOk && (
              <p className="fail">
                {t(
                  `每一條都要超過轉速上限 ${f(maxWheel / TAU, 0)} rps：${move ? '開慢一點、' : ''}靠近一點，或提高上限（換齒比、換馬達）。`,
                  `Every trajectory needs more than the ${f(maxWheel / TAU, 0)} rps speed limit: ${move ? 'drive slower, ' : ''}get closer, or raise the limit (change the gear ratio or motor).`,
                )}
              </p>
            )}
            <AimView plan={plan} opts={opts} sel={sel} onPick={(o) => setPicked(deg(o.angle))} />
            <div className="fa-opts" role="group" aria-label={t('選軌跡', 'Pick a trajectory')}>
              {/* 砲台角度由左往右變大 */}
              {[...opts].reverse().map((o) => (
                <button
                  key={o.angle}
                  type="button"
                  className="fa-opt"
                  aria-pressed={sel === o}
                  disabled={!o.reachable}
                  onClick={() => setPicked(deg(o.angle))}
                >
                  <b>{deg(o.angle)}°</b>
                  <span>{o.reachable ? `${f(o.wheel / TAU, 1)} rps` : t(`${f(o.wheel / TAU, 0)} rps 超過上限`, `${f(o.wheel / TAU, 0)} rps, over limit`)}</span>
                  <span className="small muted">{o.tolerance === null ? '±—' : `±${f(o.tolerance * 100, 1)}%`}</span>
                </button>
              ))}
            </div>
            {sel ? (
              <div className="fa-result">
                <div className="fa-big">
                  <span>
                    {t('目標轉速', 'Target speed')} <b>{f(sel.wheel / TAU, 1)} rps</b>
                  </span>
                  <span>
                    {t('砲台角度', 'Turret angle')} <b>{deg(sel.angle)}°</b>
                  </span>
                  {move && (
                    <span>
                      {t('底盤', 'Chassis')} <b>{yawText(sel.yaw)}</b>
                    </span>
                  )}
                </div>
                <dl className="fw-derived">
                  <dt>{t('出口球速', 'Exit speed')}</dt>
                  <dd>
                    {f(sel.exit, 2)} m/s
                    {move &&
                      t(
                        `（相對機器人；加上機器人速度後對地 ${f(sel.fieldExit, 2)} m/s、往上 ${deg(sel.fieldAngle)}°）`,
                        ` (relative to the robot; with the robot’s velocity added, ${f(sel.fieldExit, 2)} m/s over the field at ${deg(sel.fieldAngle)}°)`,
                      )}
                  </dd>
                  {move && (
                    <>
                      <dt>{t('站著不動射', 'Shooting standing still')}</dt>
                      <dd>{stillText(mech, plan, sel)}</dd>
                    </>
                  )}
                  <dt>{t('最高點', 'Apex')}</dt>
                  <dd>{t(`離地 ${f(sel.apex, 2)} m`, `${f(sel.apex, 2)} m above the floor`)}</dd>
                  <dt>{t('進框角度', 'Entry angle')}</dt>
                  <dd>{t(`往下 ${f(sel.entry * DEG, 0)}°（越陡越不容易撞到開口邊）`, `${f(sel.entry * DEG, 0)}° downward (steeper is less likely to hit the rim)`)}</dd>
                  <dt>{t('轉速可以差', 'Speed tolerance')}</dt>
                  <dd>
                    {sel.tolerance === null
                      ? '—'
                      : t(
                          `±${f(sel.tolerance * 100, 1)}%（±${f((sel.tolerance * sel.wheel) / TAU, 1)} rps）還會進`,
                          `±${f(sel.tolerance * 100, 1)}% (±${f((sel.tolerance * sel.wheel) / TAU, 1)} rps) still goes in`,
                        )}
                  </dd>
                  <dt>{t('一發大約掉', 'Drop per shot')}</dt>
                  <dd>
                    {f(dip * 100, 1)}%
                    {sel.tolerance !== null && (
                      <span className={dip > sel.tolerance ? 'fail' : 'pass'}>
                        {' '}
                        {dip > sel.tolerance ? t('比容許的多：下一發要等轉速回來才射', 'More than the tolerance: wait for the speed to recover before the next shot') : t('在容許範圍內', 'Within tolerance')}
                      </span>
                    )}
                  </dd>
                </dl>
                <button className="btn primary" type="button" onClick={() => apply(sel)}>
                  {move ? t('用這組到 3F 邊開邊射', 'Use this in 3F shoot on the move') : t('用這組到 3F 連射模擬', 'Use this in the 3F rapid-fire sim')}
                </button>
              </div>
            ) : (
              <p className="small">{t('點一條軌跡看它要的轉速和砲台角度。', 'Click a trajectory to see its speed and turret angle.')}</p>
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              {t(
                <>
                  不計空氣阻力、假設球不打滑；{move ? '機器人速度用出射那一刻的，沒算程式算完到球射出去的延遲；' : ''}轉速是打到目標中心的值，實際要上機射幾發再微調。「超過上限」是要的轉速比轉速上限（{f(maxWheel / TAU, 0)} rps）還高，不能選；「±—」是轉速低一點球就沒辦法從上面掉進開口，容許誤差算不出來。
                </>,
                <>
                  Ignores air drag and assumes the ball doesn’t slip; {move ? 'uses the robot velocity at the moment of release, without the delay between the code finishing and the ball leaving; ' : ''}the speed is for hitting the target center, so shoot a few on the real robot and fine-tune. “Over limit” means the needed speed is above the speed limit ({f(maxWheel / TAU, 0)} rps) and can’t be picked; “±—” means a slightly slower ball can no longer drop in from above, so no tolerance can be computed.
                </>,
              )}
            </p>
          </>
        )}
      </div>

      {move && <MoveCode mech={mech} plan={plan} sel={sel} maxWheel={maxWheel} />}
    </div>
  )
}

/** 邊移動邊射：機器人程式怎麼寫（決策 129） */
function MoveCode({ mech, plan, sel, maxWheel }: { mech: FlywheelMechanism; plan: ShotPlan; sel: TrajectoryOption | null; maxWheel: number }) {
  return (
    <div className="panel" id="move-code">
      <h2>
        <span className="fa-step">5</span>{t('程式怎麼寫？', 'How do I write the code?')}
      </h2>
      <p className="small" style={{ marginTop: 0 }}>
        {t(
          <>
            上面是「某一刻」的答案。比賽時機器人一直在動，距離和速度每一刻都不一樣，所以程式要<b>每個週期（20 ms）重算一次</b>，做法跟這一頁一樣：
          </>,
          <>
            Above is the answer for one moment. In a match the robot keeps moving and the distance and velocity change every instant, so the code has to <b>recompute every loop (20 ms)</b>, the same way this page does:
          </>,
        )}
      </p>
      <ol className="small">
        {t(
          <>
            <li>
              <b>讀位置和速度</b>：從底盤的里程計（odometry）拿機器人在場上的位置，和對場地的速度。
            </li>
            <li>
              <b>拆成兩個方向</b>：算機器人到目標的距離和方向，把速度拆成「往目標方向的速度」和「側向速度」（就是第 3 步填的兩個數字）。
            </li>
            <li>
              <b>算轉速和底盤偏角</b>：砲台角度固定，用二分法找剛好打到目標中心的球速，換成飛輪 rps；側向速度會把球帶歪，底盤往反方向偏一點。
            </li>
            <li>
              <b>對準了才送球</b>：飛輪轉速到了、車頭轉到「正對目標 + 偏角」了，才把球送進飛輪。駕駛照常開，車頭方向交給程式。
            </li>
          </>,
          <>
            <li>
              <b>Read position and velocity</b>: get the robot’s field position and field-relative velocity from the drivetrain odometry.
            </li>
            <li>
              <b>Split into two directions</b>: compute the distance and direction to the target, and split the velocity into “speed toward the target” and “sideways speed” (the two numbers from step 3).
            </li>
            <li>
              <b>Compute wheel speed and chassis offset</b>: with the turret angle fixed, bisect for the ball speed that hits the target center and convert it to flywheel rps; sideways speed pushes the ball off line, so the chassis aims a little the other way.
            </li>
            <li>
              <b>Feed only when aimed</b>: feed the ball into the flywheel only once the wheel is at speed and the heading is at “facing the target + offset”. The driver keeps driving; the code owns the heading.
            </li>
          </>,
        )}
      </ol>
      {sel ? (
        <>
          <p className="small muted">
            {t(
              <>
                第一段是算轉速和偏角的類別，數字已經照你選的 {deg(sel.angle)}° 軌跡和上面的機構、目標填好（純 Java，不用 WPILib，可以直接寫單元測試）。第二段放在射球 Command 的 execute() 裡，底盤、飛輪、送球的方法要換成你們自己的。
              </>,
              <>
                The first block is the class that computes the speed and offset, with the numbers already filled in for your {deg(sel.angle)}° trajectory and the mechanism and target above (plain Java, no WPILib, so you can unit-test it directly). The second block goes in your shoot command’s execute(); swap in your own drivetrain, flywheel and feeder methods.
              </>,
            )}
          </p>
          <h3 className="small">ShootOnTheMove.java</h3>
          <pre className="code">{moveShotJava(mech, { ...plan, angle: sel.angle }, maxWheel, sel.tolerance)}</pre>
          <h3 className="small">{t('射球 Command 的 execute()', 'The shoot command’s execute()')}</h3>
          <pre className="code">{MOVE_SHOT_USAGE}</pre>
        </>
      ) : (
        <p className="small">{t('先在上面選一條軌跡，這裡會照那條軌跡的砲台角度把程式的數字填好。', 'Pick a trajectory above first; the code numbers here get filled in for that trajectory’s turret angle.')}</p>
      )}
      <ul className="small muted" style={{ marginBottom: 0 }}>
        {t(
          <>
            <li>這只是算法和範例，不是完整的子系統：目標座標（紅藍方不同）、CAN ID、飛輪設定（見 3F「程式設定」）、車頭方向的 PID 都要照你們的機器人寫。</li>
            <li>範例的距離是用 odometry 的位置算的，也就是機器人中心。<code>RELEASE_AHEAD</code> 是照上面「目標距離從哪裡量」填的，選的不是機器人中心的話，要先把位置換成那一點，或回上面改選機器人中心。</li>
            <li>網站沒算程式算完到球射出去的延遲。機器人開很快時，可以先用「速度 × 延遲」把位置往前推再算，延遲要自己量。</li>
            <li>不計空氣阻力：上機先站著射，再慢慢開快，球一直偏近就把 MPS_PER_RPS 調小（轉速會變高），偏遠就調大。</li>
          </>,
          <>
            <li>This is only the math and an example, not a full subsystem: the target coordinates (different for red and blue), CAN IDs, flywheel config (see “Code settings” in 3F) and the heading PID all have to match your robot.</li>
            <li>The example computes distance from the odometry pose, which is the robot center. <code>RELEASE_AHEAD</code> follows “Target distance measured from” above; if you didn’t pick the robot center, convert the position to that point first, or go back and pick the robot center.</li>
            <li>The site ignores the delay from the code finishing to the ball leaving. When the robot is fast, project the position forward by “velocity × delay” before computing; measure the delay yourself.</li>
            <li>Air drag is ignored: on the robot, shoot standing still first, then drive faster. If the ball keeps falling short, lower MPS_PER_RPS (the speed goes up); if it goes long, raise it.</li>
          </>,
        )}
      </ul>
    </div>
  )
}

const FIX_LABEL = t(
  { toward: '往目標方向的速度', side: '側向速度', distance: '目標距離', limit: '轉速上限' },
  { toward: 'Speed toward the target', side: 'Sideways speed', distance: 'Target distance', limit: 'Speed limit' },
)

/** 邊移動邊射的參數修正意見：一次改一個，按「套用」直接改 */
function FixAdvice({ win, fixes, values, onApply }: { win: AimWindow | null; fixes: MoveFix[]; values: Record<MoveFix['param'], number>; onApply: (x: MoveFix) => void }) {
  const show = (p: MoveFix['param'], v: number) => (p === 'limit' ? `${f(v / TAU, 0)} rps` : p === 'distance' ? `${f(v, 1)} m` : `${f(v, 1)} m/s`)
  return (
    <div className="warn fa-fix">
      <p style={{ marginTop: 0 }}>
        <b>
          {win
            ? t(`能打進的砲台角度只有 ${span(win.lo, win.hi)}（${f(win.width * DEG, 1)}° 寬）`, `Only turret angles ${span(win.lo, win.hi)} go in (${f(win.width * DEG, 1)}° wide)`)
            : t('沒有砲台角度打得進', 'No turret angle goes in')}
        </b>
        {t(`，至少要 ${f(NARROW_WINDOW * DEG, 0)}° 寬才比較射得到（實際的角度、轉速都會有誤差）。`, `; it needs at least ${f(NARROW_WINDOW * DEG, 0)}° to be reliable (real angles and speeds always have some error). `)}
        {fixes.length ? t('改下面其中一個就好：', 'Change just one of these:') : ''}
      </p>
      {fixes.length ? (
        <ul className="fa-fixes">
          {fixes.map((x) => (
            <li key={x.param}>
              <span>
                {t('「', '“')}
                {FIX_LABEL[x.param]}
                {t('」', '” ')}
                {show(x.param, values[x.param])} → <b>{show(x.param, x.value)}</b>
                <span className="small muted">{t(`（砲台角度 ${span(x.window.lo, x.window.hi)}）`, ` (turret angle ${span(x.window.lo, x.window.hi)})`)}</span>
              </span>
              <button className="btn small" type="button" onClick={() => onApply(x)}>
                {t('套用', 'Apply')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ marginBottom: 0 }}>{t('速度在 ±5 m/s、距離 15 m 以內都找不到：改砲台轉軸高度，或換機構試試。', 'Nothing found within ±5 m/s and 15 m: change the turret pivot height or try a different mechanism.')}</p>
      )}
    </div>
  )
}

/** 轉速上限欄位下面的說明 */
function limitHint(rps: number, freeSpeed: number): string {
  const motor = (freeSpeed * DEFAULT_LIMIT_FRACTION) / TAU
  if (rps <= 0) return t(`0 = 用馬達空載轉速的 90%（約 ${f(motor, 0)} rps）`, `0 = use 90% of the motor’s free speed (about ${f(motor, 0)} rps)`)
  if (rps > motor) return t(`比馬達做得到的高，用空載轉速的 90%（約 ${f(motor, 0)} rps）`, `Higher than the motor can do; using 90% of free speed (about ${f(motor, 0)} rps)`)
  return t('選軌跡只挑這個轉速以內的', 'Only trajectories within this speed are offered')
}

/** 跟站著不動射比：同一個砲台角度要幾 rps */
function stillText(mech: FlywheelMechanism, plan: ShotPlan, sel: TrajectoryOption): string {
  const w = wheelForGoal(exitRadius(mech), { ...plan, angle: sel.angle })
  if (w === null) return t('這個砲台角度站著射不進', 'At this turret angle it doesn’t go in standing still')
  const diff = (sel.wheel - w) / TAU
  return t(
    `同一個砲台角度要 ${f(w / TAU, 1)} rps、底盤正對目標（邊移動邊射${diff >= 0 ? '多' : '少'} ${f(Math.abs(diff), 1)} rps）`,
    `Same turret angle needs ${f(w / TAU, 1)} rps with the chassis facing the target (shooting on the move needs ${f(Math.abs(diff), 1)} rps ${diff >= 0 ? 'more' : 'less'})`,
  )
}

const W = 640
const H = 260
const GROUND = H - 22
const LX = 40

function AimView({ plan, opts, sel, onPick }: { plan: ShotPlan; opts: TrajectoryOption[]; sel: TrajectoryOption | null; onPick: (o: TrajectoryOption) => void }) {
  const xMax = (plan.goalDistance + plan.goalWidth / 2) * 1.08
  const yMax = Math.max(plan.goalHeight, plan.height, ...opts.map((o) => o.apex)) * 1.1
  // x = 0 是量距離的那一點；每條軌跡從那個砲台角度的出射點出發
  const pivotX = plan.distanceFrom === 'pivot' ? 0 : plan.pivotAhead
  const s = Math.min((W - LX - 20) / xMax, (GROUND - 12) / yMax)
  // 軌跡比較高瘦時，畫面寬度跟著縮，手機上才不會只用到一半
  const vw = Math.max(H, LX + xMax * s + 20)
  const px = (x: number) => LX + x * s
  const py = (y: number) => GROUND - y * s
  const gy = GROUND - plan.goalHeight * s
  const path = (o: TrajectoryOption) => {
    const x0 = releaseAhead(plan, o.angle)
    const h0 = releaseHeight(plan, o.angle)
    const T = flightTime(o.fieldExit, o.fieldAngle, h0, plan.goalHeight)
    const pts: string[] = []
    for (let i = 0; i <= 40; i++) {
      const p = ballAt(o.fieldExit, o.fieldAngle, (T * i) / 40)
      pts.push(`${px(x0 + p.x).toFixed(1)},${py(h0 + p.y).toFixed(1)}`)
    }
    return pts.join(' ')
  }
  // 選到的畫在最上面
  const order = sel ? [...opts.filter((o) => o !== sel), sel] : opts
  return (
    <svg viewBox={`0 0 ${vw} ${H}`} width="100%" className="fa-view" role="img" aria-label={t(`${opts.length} 條候選軌跡${sel ? `，選了 ${deg(sel.angle)}°` : ''}`, `${opts.length} candidate trajectories${sel ? `, ${deg(sel.angle)}° selected` : ''}`)}>
      <rect x={0} y={GROUND} width={vw} height={H - GROUND} className="ev-base" />
      <line x1={px(plan.goalDistance + plan.goalWidth / 2)} y1={gy} x2={px(plan.goalDistance + plan.goalWidth / 2)} y2={GROUND} className="fv-goal-post" />
      <line x1={px(plan.goalDistance - plan.goalWidth / 2)} y1={gy} x2={px(plan.goalDistance + plan.goalWidth / 2)} y2={gy} className="fv-goal" />
      <line x1={px(pivotX)} y1={GROUND} x2={px(pivotX)} y2={py(plan.height)} className="ev-frame" />
      {order.map((o) => (
        <g key={o.angle} className={'fa-path' + (o === sel ? ' sel' : '') + (o.reachable ? '' : ' no')} onClick={() => o.reachable && onPick(o)}>
          <polyline points={path(o)} className="fa-line" />
          {/* 比較好點的透明粗線 */}
          <polyline points={path(o)} className="fa-hit" />
          {(o === sel || deg(o.angle) % 10 === 0 || o === opts[0] || o === opts[opts.length - 1]) && (
            <text x={px(Math.min(xMax / 1.08, releaseAhead(plan, o.angle) + (o.fieldExit * o.fieldExit * Math.sin(2 * o.fieldAngle)) / (2 * GRAVITY)))} y={py(o.apex) - 4} className="fa-label">
              {deg(o.angle)}°
            </text>
          )}
        </g>
      ))}
      <circle cx={px(pivotX)} cy={py(plan.height)} r={4} className="ch-pivot" />
    </svg>
  )
}
