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
  launchRange,
  wheelForGoal,
  START_KP,
  type FlywheelKnobs,
  type FlywheelMechanism,
  type ShotPlan,
  angleFromTurret,
  turretDeg,
} from '../../core/flywheel/flywheel'
import { FLYWHEEL_LESSONS } from './flywheelLessons'
import { BallFields, HubPreset, MechFields } from './FlywheelForms'
import { FlywheelAim } from './FlywheelAim'
import { loadFlywheelStyle, useFlywheelMechanism, useMoveSettings, usePersisted, useShotPlan } from './flywheelStore'

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
          <h1 id="t-fw-move">射球飛輪・邊移動邊射</h1>
          <p className="lead">Shoot on the move：先填機構和球、離目標多遠，再填機器人怎麼動，看每個砲台角度要幾 rps、底盤要偏幾度，選一條軌跡，再到 3F 邊開邊射。</p>
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
          <h1 id="t-fw-aim">射球飛輪・算轉速和砲台角度</h1>
          <p className="lead">先填機構和球，再填離目標多遠，看每個砲台角度要幾 rps，選一條軌跡，再到 3F 連射模擬。</p>
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
  const range = launchRange(v, plan.angle, plan.height, plan.goalHeight)
  const miss = range - plan.goalDistance
  const hit = Math.abs(miss) <= plan.goalWidth / 2
  // 反推：要進目標 → 要幾 rps
  const needW = wheelForGoal(exitRadius(mech), plan)
  const spinUp = useMemo(() => fastestSpinUp(mech, plan.target, knobs.statorLimit), [mech, plan.target, knobs.statorLimit])
  const rows: { name: string; value: string; unit: string; src: string; note: string }[] = [
    { name: 'kS', value: '要量', unit: 'V', src: '量', note: '公式算不出摩擦。慢慢加電壓，飛輪剛好開始轉的電壓就是 kS' },
    { name: 'kV', value: f(ff.kV * TAU, 4), unit: 'V/rps', src: '算', note: '12 V ÷ 最高轉速' },
    { name: 'kA', value: f(ff.kA * TAU, 4), unit: 'V/(rps/s)', src: '算', note: '跟轉動慣量成正比；只在有加速度限制時用到' },
    { name: 'kP', value: f(START_KP * TAU, 2), unit: 'V/rps', src: '調', note: '起始值，不是算出來的，到 3F 調' },
    { name: 'kI', value: '0', unit: 'V/rot', src: '調', note: '飛輪通常不用，起步時會衝過頭' },
    { name: 'kD', value: '0', unit: 'V/(rps/s)', src: '調', note: '飛輪幾乎不用' },
  ]

  return (
    <section aria-labelledby="t-fw-calc">
      <div className="head">
        <div>
          <h1 id="t-fw-calc">射球飛輪・計算參數</h1>
          <p className="lead">填入飛輪的機構資料，右邊的參數會即時更新。再看轉速要多少球才會落在你要的地方。</p>
        </div>
        <span className="phase">
          教學關卡 {done} / {FLYWHEEL_LESSONS.length}
        </span>
      </div>

      <div className="grid2">
        <div className="stack">
          <div className="panel">
            <h2>機構</h2>
            <MechFields mech={mech} setM={setM} />
          </div>

          <div className="panel">
            <h2>轉速 → 球速 → 進不進目標</h2>
            <div className="fields">
              <NumberField label="目標轉速" value={plan.target} display={1 / TAU} digits={1} onChange={(x) => setP({ target: x })} min={1} max={150} step={1} unit="rps" />
              <BallFields plan={plan} setP={setP} />
              <NumberField label="砲台角度" value={turretDeg(plan.angle)} digits={0} onChange={(x) => setP({ angle: angleFromTurret(x) })} min={5} max={85} step={1} unit="°" hint="正上方 0°，往目標倒角度變大" />
              <NumberField label="出射高度" value={plan.height} onChange={(x) => setP({ height: x })} min={0} max={2} step={0.05} unit="m" hint="離地多高" />
            </div>
            <div className="fields three" style={{ marginTop: 12 }}>
              <NumberField label="目標距離" value={plan.goalDistance} onChange={(x) => setP({ goalDistance: x })} min={0.2} max={20} step={0.1} unit="m" hint="離出射點的水平距離" />
              <NumberField label="目標高度" value={plan.goalHeight} onChange={(x) => setP({ goalHeight: x })} min={0} max={5} step={0.05} unit="m" hint="0 = 地面" />
              <NumberField label="開口寬度" value={plan.goalWidth} onChange={(x) => setP({ goalWidth: x })} min={0.05} max={3} step={0.05} unit="m" />
            </div>
            <HubPreset setP={setP} />
            <dl className="fw-derived">
              <dt>輪緣速度</dt>
              <dd>{f(plan.target * mech.wheelRadius, 2)} m/s</dd>
              <dt>出口球速</dt>
              <dd>{mech.back === 'rollers' ? `${f(v, 2)} m/s（兩邊輪緣速度的平均）` : `${f(v, 2)} m/s（輪緣的 ${EXIT_RATIO}）`}</dd>
              <dt>最高點</dt>
              <dd>離地 {f(apexHeight(v, plan.angle, plan.height), 2)} m</dd>
              <dt>落點</dt>
              <dd>
                {Number.isFinite(range) ? (
                  <>
                    {f(range, 2)} m（往下掉經過 {f(plan.goalHeight, 2)} m 高的地方）
                    <span className={hit ? 'pass' : 'fail'}>
                      {' '}
                      {hit ? '進了' : '沒進'}，{miss >= 0 ? '遠' : '近'} {f(Math.abs(miss) * 100, 0)} cm
                    </span>
                  </>
                ) : (
                  <span className="fail">打不到 {f(plan.goalHeight, 2)} m 高</span>
                )}
              </dd>
              <dt>一發大約掉</dt>
              <dd>
                {f(dipFraction(mech, plan.ballMass) * 100, 1)}%（{f((dipFraction(mech, plan.ballMass) * plan.target) / TAU, 1)} rps）
              </dd>
            </dl>
            <div className="fw-need" style={{ marginTop: 12 }}>
              要進目標的轉速
              <b>{needW === null ? '這個砲台角度射不進（目標太近或太高）' : `${f(needW / TAU, 1)} rps`}</b>
              {needW !== null && needW > ff.freeSpeed * 0.9 && <span className="small fail">超過最高轉速的 90%，馬達轉不到：改齒比或砲台角度</span>}
              {needW !== null && Math.abs(needW - plan.target) > 0.05 * TAU && (
                <span>
                  <button className="btn small" type="button" onClick={() => setP({ target: Math.round((needW / TAU) * 10) * (TAU / 10) })}>
                    設成目標轉速
                  </button>
                </span>
              )}
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              {mech.back === 'rollers' ? '球速當成兩邊輪緣速度的平均（不打滑）' : '球速當成輪緣速度的一半（單邊飛輪）'}、不計空氣阻力和球的旋轉，都是近似。實際的比例要上機射幾發量落點。
            </p>
          </div>

          <div className="panel">
            <h2>教學關卡</h2>
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
                        <div className="goal">學習目標：{l.goal}</div>
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
          <h2>Slot0 參數（Phoenix 6，rps）</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>參數</th>
                  <th className="num">數值</th>
                  <th>怎麼來</th>
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
            <dt>轉動慣量 J</dt>
            <dd>{(ff.J * 1e4).toFixed(2)} kg·cm²</dd>
            <dt>最高轉速</dt>
            <dd>約 {f(ff.freeSpeed / TAU, 0)} rps（12 V，不含摩擦）</dd>
            <dt>轉在目標要</dt>
            <dd>{f(ff.kV * plan.target, 2)} V ＋ kS</dd>
            <dt>最快到速</dt>
            <dd>
              {spinUp === null ? '到不了' : `約 ${f(spinUp, 2)} s`}（12 V、{knobs.statorLimit > 0 ? `每顆限 ${knobs.statorLimit} A` : '不限電流'}、不含摩擦；電流限制在 3F 改）
            </dd>
          </dl>
          {plan.target >= ff.freeSpeed * 0.9 && <div className="warn">目標轉速太接近最高轉速：電壓不夠，到 3F 也調不到。降低目標或改齒比。</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn primary"
              type="button"
              onClick={() => go('sim')}
            >
              到 3F 連射模擬
            </button>
          </div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            3F 的滑桿預設就是這裡的理論值，改機構資料會跟著變。
          </p>
        </aside>
      </div>
    </section>
  )
}
