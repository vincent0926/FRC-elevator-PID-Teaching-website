import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { NumberField } from '../../components/NumberField'
import { Quiz } from '../../components/Quiz'
import {
  computeFlywheelFeedforward,
  DEFAULT_KNOBS,
  dipFraction,
  exitSpeed,
  exitRadius,
  apexHeight,
  EXIT_RATIO,
  fastestSpinUp,
  rangeAtWheel,
  releaseHeight,
  wheelForGoal,
  START_KP,
  type FlywheelKnobs,
  type FlywheelMechanism,
  type ShotPlan,
  angleFromTurret,
  turretDeg,
} from '../../core/flywheel/flywheel'
import { FLYWHEEL_LESSONS } from './flywheelLessons'
import { BallFields, distanceHint, GoalDistanceField, HubPreset, MechFields, TurretFields } from './FlywheelForms'
import { FlywheelAim } from './FlywheelAim'
import { loadFlywheelStyle, useFlywheelMechanism, useMoveSettings, usePersisted, useShotPlan } from './flywheelStore'
import { t } from '../../core/lang'

/**
 * 射球飛輪 1F，看進站選的用法：
 * - 彈道：算轉速和仰角（FlywheelAim）：基本參數 → 距離 → 選軌跡，再到 3F 連射模擬
 * - 客製化：機構資料 → kV、kA，轉速 → 球速 → 射程，加上三個教學關卡。內部 SI，畫面 rps。
 * - 邊移動邊射：跟彈道一樣，多填機器人速度，算轉速、仰角和底盤偏角
 */

const TAU = 2 * Math.PI
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function FlywheelCalcPage() {
  // 讀一次就好：換用法要回進站重選，整頁會重新掛上
  const [style] = useState(loadFlywheelStyle)
  if (style === 'move') return <MoveCalc />
  return style === 'ballistic' ? <BallisticCalc /> : <CustomCalc />
}

function MoveCalc() {
  const { go } = useStore()
  const [mech, setMech] = useFlywheelMechanism()
  const [plan, setPlan] = useShotPlan()
  const [move, setMove] = useMoveSettings()
  return (
    <section aria-labelledby="t-fw-move">
      <div className="head">
        <div>
          <h1 id="t-fw-move">{t('射球飛輪・邊移動邊射', 'Flywheel shooter · Shoot on the move')}</h1>
          <p className="lead">
            {t(
              'Shoot on the move：先填機構和球、離目標多遠，再填機器人怎麼動，看每個砲台角度要幾 rps、底盤要偏幾度，選一條軌跡，再到 3F 邊開邊射。',
              'Fill in the mechanism, ball and distance to the target, then how the robot is moving. See how many rps each turret angle needs and how far to turn the chassis, pick a trajectory, then go to 3F to shoot while driving.',
            )}
          </p>
        </div>
      </div>
      <FlywheelAim mech={mech} setMech={setMech} plan={plan} setPlan={setPlan} onSimulate={() => go('sim')} move={{ settings: move, set: setMove }} />
    </section>
  )
}

function BallisticCalc() {
  const { go } = useStore()
  const [mech, setMech] = useFlywheelMechanism()
  const [plan, setPlan] = useShotPlan()
  return (
    <section aria-labelledby="t-fw-aim">
      <div className="head">
        <div>
          <h1 id="t-fw-aim">{t('射球飛輪・算轉速和砲台角度', 'Flywheel shooter · Speed and turret angle')}</h1>
          <p className="lead">
            {t(
              '先填機構和球，再填離目標多遠，看每個砲台角度要幾 rps，選一條軌跡，再到 3F 連射模擬。',
              'Fill in the mechanism and ball, then the distance to the target. See how many rps each turret angle needs, pick a trajectory, then run the 3F rapid-fire sim.',
            )}
          </p>
        </div>
      </div>
      <FlywheelAim mech={mech} setMech={setMech} plan={plan} setPlan={setPlan} onSimulate={() => go('sim')} />
    </section>
  )
}

function CustomCalc() {
  const { go, lessonsDone, markLesson } = useStore()
  const [mech, setMech] = useFlywheelMechanism()
  const [plan, setPlan] = useShotPlan()
  // 電流限制跟 3F「真實一點」同一份
  const [knobs] = usePersisted<FlywheelKnobs>('flywheel:knobs', DEFAULT_KNOBS)
  const ff = useMemo(() => computeFlywheelFeedforward(mech), [mech])
  const [open, setOpen] = useState<string | null>(() => FLYWHEEL_LESSONS.find((l) => !lessonsDone[l.id])?.id ?? null)
  const done = FLYWHEEL_LESSONS.filter((l) => lessonsDone[l.id]).length
  const setM = (p: Partial<FlywheelMechanism>) => setMech({ ...mech, ...p })
  const setP = (p: Partial<ShotPlan>) => setPlan({ ...plan, ...p })

  const v = exitSpeed(plan.target, exitRadius(mech))
  const range = rangeAtWheel(plan.target, exitRadius(mech), plan)
  const miss = range - plan.goalDistance
  const hit = Math.abs(miss) <= plan.goalWidth / 2
  // 反推：要進目標 → 要幾 rps
  const needW = wheelForGoal(exitRadius(mech), plan)
  const spinUp = useMemo(() => fastestSpinUp(mech, plan.target, knobs.statorLimit), [mech, plan.target, knobs.statorLimit])
  const rows: { name: string; value: string; unit: string; src: string; note: string }[] = [
    { name: 'kS', value: t('要量', 'measure'), unit: 'V', src: t('量', 'Measured'), note: t('公式算不出摩擦。慢慢加電壓，飛輪剛好開始轉的電壓就是 kS', 'Friction can’t be calculated. Slowly raise the voltage; the voltage where the flywheel just starts turning is kS') },
    { name: 'kV', value: f(ff.kV * TAU, 4), unit: 'V/rps', src: t('算', 'Calculated'), note: t('12 V ÷ 最高轉速', '12 V ÷ top speed') },
    { name: 'kA', value: f(ff.kA * TAU, 4), unit: 'V/(rps/s)', src: t('算', 'Calculated'), note: t('跟轉動慣量成正比；只在有加速度限制時用到', 'Proportional to the moment of inertia; only used with an acceleration limit') },
    { name: 'kP', value: f(START_KP * TAU, 2), unit: 'V/rps', src: t('調', 'Tuned'), note: t('起始值，不是算出來的，到 3F 調', 'A starting value, not calculated; tune it in 3F') },
    { name: 'kI', value: '0', unit: 'V/rot', src: t('調', 'Tuned'), note: t('飛輪通常不用，起步時會衝過頭', 'Usually unused on flywheels; it overshoots on spin-up') },
    { name: 'kD', value: '0', unit: 'V/(rps/s)', src: t('調', 'Tuned'), note: t('飛輪幾乎不用', 'Almost never used on flywheels') },
  ]

  return (
    <section aria-labelledby="t-fw-calc">
      <div className="head">
        <div>
          <h1 id="t-fw-calc">{t('射球飛輪・計算參數', 'Flywheel shooter · Calculate gains')}</h1>
          <p className="lead">
            {t(
              '填入飛輪的機構資料，右邊的參數會即時更新。再看轉速要多少球才會落在你要的地方。',
              'Enter the flywheel’s mechanism data and the gains on the right update immediately. Then see what speed puts the ball where you want it.',
            )}
          </p>
        </div>
        <span className="phase">
          {t(`教學關卡 ${done} / ${FLYWHEEL_LESSONS.length}`, `Lessons ${done} / ${FLYWHEEL_LESSONS.length}`)}
        </span>
      </div>

      <div className="grid2">
        <div className="stack">
          <div className="panel">
            <h2>{t('機構', 'Mechanism')}</h2>
            <MechFields mech={mech} setM={setM} />
          </div>

          <div className="panel">
            <h2>{t('轉速 → 球速 → 進不進目標', 'Wheel speed → ball speed → does it go in?')}</h2>
            <div className="fields">
              <NumberField label={t('目標轉速', 'Target speed')} value={plan.target} display={1 / TAU} digits={1} onChange={(x) => setP({ target: x })} min={1} max={150} step={1} unit="rps" />
              <BallFields plan={plan} setP={setP} />
              <NumberField label={t('砲台角度', 'Turret angle')} value={turretDeg(plan.angle)} digits={0} onChange={(x) => setP({ angle: angleFromTurret(x) })} min={5} max={85} step={1} unit="°" hint={t('正上方 0°，往目標倒角度變大', 'Straight up is 0°, grows as it tips toward the target')} />
            </div>
            <div className="fields three" style={{ marginTop: 12 }}>
              <GoalDistanceField plan={plan} setP={setP} hint={distanceHint(plan)} />
              <NumberField label={t('目標高度', 'Target height')} value={plan.goalHeight} onChange={(x) => setP({ goalHeight: x })} min={0} max={5} step={0.05} unit="m" hint={t('0 = 地面', '0 = floor')} />
              <NumberField label={t('開口寬度', 'Opening width')} value={plan.goalWidth} onChange={(x) => setP({ goalWidth: x })} min={0.05} max={3} step={0.05} unit="m" />
            </div>
            <HubPreset setP={setP} />
            <div style={{ marginTop: 12 }}>
              <TurretFields plan={plan} setP={setP} angle={plan.angle} />
            </div>
            <dl className="fw-derived">
              <dt>{t('輪緣速度', 'Wheel surface speed')}</dt>
              <dd>{f(plan.target * mech.wheelRadius, 2)} m/s</dd>
              <dt>{t('出口球速', 'Exit speed')}</dt>
              <dd>
                {mech.back === 'rollers'
                  ? t(`${f(v, 2)} m/s（兩邊輪緣速度的平均）`, `${f(v, 2)} m/s (average of both wheel surface speeds)`)
                  : t(`${f(v, 2)} m/s（輪緣的 ${EXIT_RATIO}）`, `${f(v, 2)} m/s (${EXIT_RATIO} × surface speed)`)}
              </dd>
              <dt>{t('最高點', 'Apex')}</dt>
              <dd>{t(`離地 ${f(apexHeight(v, plan.angle, releaseHeight(plan)), 2)} m`, `${f(apexHeight(v, plan.angle, releaseHeight(plan)), 2)} m above the floor`)}</dd>
              <dt>{t('落點', 'Landing')}</dt>
              <dd>
                {Number.isFinite(range) ? (
                  <>
                    {t(`${f(range, 2)} m（往下掉經過 ${f(plan.goalHeight, 2)} m 高的地方）`, `${f(range, 2)} m (where it falls through ${f(plan.goalHeight, 2)} m height)`)}
                    <span className={hit ? 'pass' : 'fail'}>
                      {' '}
                      {t(`${hit ? '進了' : '沒進'}，${miss >= 0 ? '遠' : '近'} ${f(Math.abs(miss) * 100, 0)} cm`, `${hit ? 'In' : 'Miss'}, ${f(Math.abs(miss) * 100, 0)} cm ${miss >= 0 ? 'long' : 'short'}`)}
                    </span>
                  </>
                ) : (
                  <span className="fail">{t(`打不到 ${f(plan.goalHeight, 2)} m 高`, `Can’t reach ${f(plan.goalHeight, 2)} m height`)}</span>
                )}
              </dd>
              <dt>{t('一發大約掉', 'Drop per shot')}</dt>
              <dd>
                {f(dipFraction(mech, plan.ballMass) * 100, 1)}%{t('（', ' (')}{f((dipFraction(mech, plan.ballMass) * plan.target) / TAU, 1)} rps{t('）', ')')}
              </dd>
            </dl>
            <div className="fw-need" style={{ marginTop: 12 }}>
              {t('要進目標的轉速', 'Speed to hit the target')}
              <b>{needW === null ? t('這個砲台角度射不進（目標太近或太高）', 'Doesn’t go in at this turret angle (target too close or too high)') : `${f(needW / TAU, 1)} rps`}</b>
              {needW !== null && needW > ff.freeSpeed * 0.9 && <span className="small fail">{t('超過最高轉速的 90%，馬達轉不到：改齒比或砲台角度', 'Over 90% of top speed, the motor can’t get there: change the gear ratio or turret angle')}</span>}
              {needW !== null && Math.abs(needW - plan.target) > 0.05 * TAU && (
                <span>
                  <button className="btn small" type="button" onClick={() => setP({ target: Math.round((needW / TAU) * 10) * (TAU / 10) })}>
                    {t('設成目標轉速', 'Set as target speed')}
                  </button>
                </span>
              )}
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              {mech.back === 'rollers'
                ? t('球速當成兩邊輪緣速度的平均（不打滑）', 'Ball speed is taken as the average of both wheel surface speeds (no slip)')
                : t('球速當成輪緣速度的一半（單邊飛輪）', 'Ball speed is taken as half the wheel surface speed (single flywheel)')}
              {t(
                '、不計空氣阻力和球的旋轉，都是近似。實際的比例要上機射幾發量落點。',
                ', ignoring air drag and ball spin; all approximations. Shoot a few on the real robot and measure where they land to get the real ratio.',
              )}
            </p>
          </div>

          <div className="panel">
            <h2>{t('教學關卡', 'Lessons')}</h2>
            <ol className="lessons">
              {FLYWHEEL_LESSONS.map((l) => {
                const isOpen = open === l.id
                return (
                  <li key={l.id} className={'lesson' + (lessonsDone[l.id] ? ' done' : '')}>
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.id)}>
                      <span>
                        {l.title}
                        <small>{l.sub}</small>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="body">
                        <div className="goal">{t('學習目標：', 'Goal: ')}{l.goal}</div>
                        <l.Body m={mech} ff={ff} plan={plan} />
                        <Quiz key={l.id} quiz={l.quiz} done={lessonsDone[l.id]} onCorrect={() => markLesson(l.id)} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        <aside className="panel card-param" aria-live="polite">
          <h2>{t('Slot0 參數（Phoenix 6，rps）', 'Slot0 gains (Phoenix 6, rps)')}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('參數', 'Gain')}</th>
                  <th className="num">{t('數值', 'Value')}</th>
                  <th>{t('怎麼來', 'Source')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <b>{r.name}</b>
                      <div className="small muted">{r.note}</div>
                    </td>
                    <td className="num">
                      {r.value}
                      <div className="small muted">{r.unit}</div>
                    </td>
                    <td>{r.src}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="fw-derived">
            <dt>{t('轉動慣量 J', 'Moment of inertia J')}</dt>
            <dd>{(ff.J * 1e4).toFixed(2)} kg·cm²</dd>
            <dt>{t('最高轉速', 'Top speed')}</dt>
            <dd>{t(`約 ${f(ff.freeSpeed / TAU, 0)} rps（12 V，不含摩擦）`, `About ${f(ff.freeSpeed / TAU, 0)} rps (12 V, no friction)`)}</dd>
            <dt>{t('轉在目標要', 'Holding target needs')}</dt>
            <dd>{f(ff.kV * plan.target, 2)} V + kS</dd>
            <dt>{t('最快到速', 'Fastest spin-up')}</dt>
            <dd>
              {spinUp === null ? t('到不了', 'Never reaches it') : t(`約 ${f(spinUp, 2)} s`, `About ${f(spinUp, 2)} s`)}
              {t(
                `（12 V、${knobs.statorLimit > 0 ? `每顆限 ${knobs.statorLimit} A` : '不限電流'}、不含摩擦；電流限制在 3F 改）`,
                ` (12 V, ${knobs.statorLimit > 0 ? `${knobs.statorLimit} A limit per motor` : 'no current limit'}, no friction; change the current limit in 3F)`,
              )}
            </dd>
          </dl>
          {plan.target >= ff.freeSpeed * 0.9 && <div className="warn">{t('目標轉速太接近最高轉速：電壓不夠，到 3F 也調不到。降低目標或改齒比。', 'The target speed is too close to top speed: there isn’t enough voltage, and no tuning in 3F will fix it. Lower the target or change the gear ratio.')}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn primary"
              type="button"
              onClick={() => go('sim')}
            >
              {t('到 3F 連射模擬', 'Go to the 3F rapid-fire sim')}
            </button>
          </div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            {t('3F 的滑桿預設就是這裡的理論值，改機構資料會跟著變。', 'The 3F sliders default to these theory values and follow any mechanism changes.')}
          </p>
        </aside>
      </div>
    </section>
  )
}
