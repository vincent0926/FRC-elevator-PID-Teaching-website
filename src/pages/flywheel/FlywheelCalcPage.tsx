import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { NumberField } from '../../components/NumberField'
import { Quiz } from '../../components/Quiz'
import { MOTOR_SPECS, type MotorId } from '../../core/motors'
import {
  computeFlywheelFeedforward,
  DEFAULT_KNOBS,
  dipFraction,
  exitSpeed,
  EXIT_RATIO,
  fastestSpinUp,
  launchRange,
  speedForRange,
  START_KP,
  type FlywheelKnobs,
  type FlywheelMechanism,
  type ShotPlan,
} from '../../core/flywheel/flywheel'
import { FLYWHEEL_LESSONS } from './flywheelLessons'
import { SHAPES, useFlywheelMechanism, usePersisted, useShotPlan } from './flywheelStore'

/** 射球飛輪 1F：機構資料 → kV、kA，轉速 → 球速 → 射程，加上三個教學關卡。內部 SI，畫面 rps。 */

const TAU = 2 * Math.PI
const D2R = Math.PI / 180
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function FlywheelCalcPage() {
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

  const v = exitSpeed(plan.target, mech.wheelRadius)
  const range = launchRange(v, plan.angle, plan.height)
  // 反推：想射多遠 → 要幾 rps
  const [want, setWant] = useState(() => Math.round(range * 10) / 10)
  const needV = speedForRange(want, plan.angle, plan.height)
  const needW = needV === null ? null : needV / (EXIT_RATIO * mech.wheelRadius)
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
            <div className="fields">
              <label className="f">
                馬達
                <span className="inp">
                  <select value={mech.motor} onChange={(e) => setM({ motor: e.target.value as MotorId })} aria-label="馬達">
                    {Object.values(MOTOR_SPECS).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <NumberField label="馬達數量" value={mech.motorCount} onChange={(x) => setM({ motorCount: Math.round(x) })} min={1} max={4} step={1} unit="顆" />
              <NumberField label="齒比" value={mech.gearRatio} onChange={(x) => setM({ gearRatio: x })} min={0.2} max={5} step={0.05} unit=": 1" hint="馬達轉幾圈飛輪轉 1 圈；加速傳動小於 1" />
              <NumberField label="會轉的質量" value={mech.wheelMass} onChange={(x) => setM({ wheelMass: x })} min={0.05} max={10} step={0.1} unit="kg" hint="飛輪＋輪子＋軸" />
              <NumberField label="輪子半徑" value={mech.wheelRadius} display={100} digits={2} onChange={(x) => setM({ wheelRadius: x })} min={1} max={15} step={0.1} unit="cm" />
              <label className="f">
                重量分布
                <span className="inp">
                  <select value={mech.shape} onChange={(e) => setM({ shape: Number(e.target.value) })} aria-label="重量分布">
                    {SHAPES.map((s) => (
                      <option key={s.v} value={s.v}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            </div>
          </div>

          <div className="panel">
            <h2>轉速 → 球速 → 射程</h2>
            <div className="fields">
              <NumberField label="目標轉速" value={plan.target} display={1 / TAU} digits={1} onChange={(x) => setP({ target: x })} min={1} max={150} step={1} unit="rps" />
              <NumberField label="球的質量" value={plan.ballMass} onChange={(x) => setP({ ballMass: x })} min={0.01} max={1} step={0.005} unit="kg" />
              <NumberField label="出射仰角" value={plan.angle} display={1 / D2R} digits={0} onChange={(x) => setP({ angle: x })} min={5} max={85} step={1} unit="°" />
              <NumberField label="出射高度" value={plan.height} onChange={(x) => setP({ height: x })} min={0} max={2} step={0.05} unit="m" hint="離地多高" />
            </div>
            <dl className="fw-derived">
              <dt>輪緣速度</dt>
              <dd>{f(plan.target * mech.wheelRadius, 2)} m/s</dd>
              <dt>出口球速</dt>
              <dd>{f(v, 2)} m/s（輪緣的 {EXIT_RATIO}）</dd>
              <dt>落點</dt>
              <dd>{f(range, 2)} m</dd>
              <dt>一發大約掉</dt>
              <dd>
                {f(dipFraction(mech, plan.ballMass) * 100, 1)}%（{f((dipFraction(mech, plan.ballMass) * plan.target) / TAU, 1)} rps）
              </dd>
            </dl>
            <div className="fields" style={{ marginTop: 12 }}>
              <NumberField label="想射多遠" value={want} onChange={setWant} min={0.1} max={30} step={0.1} unit="m" />
              <div className="fw-need">
                要的轉速
                <b>{needW === null ? '這個仰角射不到' : `${f(needW / TAU, 1)} rps`}</b>
                {needW !== null && needW > ff.freeSpeed * 0.9 && <span className="small fail">超過最高轉速的 90%，馬達轉不到</span>}
              </div>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              球速當成輪緣速度的一半（單邊飛輪）、不計空氣阻力和球的旋轉，都是近似。實際的比例要上機射幾發量落點。
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
            <button className="btn primary" type="button" onClick={() => go('sim')}>
              到 3F 模擬
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
