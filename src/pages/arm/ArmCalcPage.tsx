import { useState } from 'react'
import { useStore } from '../../app/store'
import { Quiz } from '../../components/Quiz'
import { ArmForm } from './ArmForm'
import { ArmParamCard } from './ArmParamCard'
import { ARM_LESSONS } from './armLessons'
import { useArm } from './armStore'
import { UnsavedNote } from './UnsavedNote'

/** 手臂 1F：機構資料 → 理論參數，加上五個教學關卡 */

const f = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '—')
const R2D = 180 / Math.PI

export function ArmCalcPage() {
  const { lessonsDone, markLesson, go } = useStore()
  const { arm, setArm, voltsPerDeg, setVoltsPerDeg, ff, theory, setCustom, setSource } = useArm()
  const [open, setOpen] = useState<string | null>(() => ARM_LESSONS.find((l) => !lessonsDone[l.id])?.id ?? null)
  const done = ARM_LESSONS.filter((l) => lessonsDone[l.id]).length

  const toSim = (asCustom: boolean) => {
    if (asCustom) {
      setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString() })
      setSource('custom')
    } else setSource('theory')
    go('sim')
  }

  return (
    <section aria-labelledby="t-arm-calc">
      <div className="head">
        <div>
          <h1 id="t-arm-calc">手臂・計算參數</h1>
          <p className="lead">填入手臂的機構資料，右邊的參數卡會即時更新。數字怎麼來的，跟著下方五個關卡一步一步看。</p>
        </div>
        <span className="phase">
          教學關卡 {done} / {ARM_LESSONS.length}
        </span>
      </div>

      <UnsavedNote />
      <div className="grid2">
        <div className="stack">
          <ArmForm m={arm} onChange={setArm} voltsPerDeg={voltsPerDeg} onVoltsPerDeg={setVoltsPerDeg} />

          <div className="panel">
            <h2>教學關卡</h2>
            <ol className="lessons">
              {ARM_LESSONS.map((l) => {
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
                        <l.Body m={arm} ff={ff} kP={theory.feedback.kP} done={lessonsDone[l.id]} />
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
          <ArmParamCard
            ps={theory}
            notes={{
              kS: ff.kS > 0 ? '你量到的值（機構資料「馬達」那一欄）' : '公式算不出，一定要上機量',
              kI: '預設 0，穩態誤差先查 kG、零點、負載',
              kD: '到位後振盪時再加',
              cruise: `上限 ${f(ff.maxVelocity * R2D, 0)} °/s 的 75%${ff.frictionIncluded ? '（已扣 kS）' : '（沒扣摩擦）'}`,
              accel: `上限的 75%${ff.frictionIncluded ? '（已扣 kS）' : ''}`,
            }}
          />
          <dl className="small arm-derived">
            <dt>水平重力力矩</dt>
            <dd>{f(ff.gravityTorque, 2)} N·m</dd>
            <dt>轉動慣量</dt>
            <dd>{f(ff.inertia, 3)} kg·m²</dd>
            <dt>最高角速度</dt>
            <dd>
              {f(ff.maxVelocity * R2D, 0)} °/s{ff.frictionIncluded ? '' : '（不含摩擦的理論上限）'}
            </dd>
            <dt>感測器</dt>
            <dd>{arm.encoder === 'cancoder' ? `CANcoder（${f(arm.cancoderToArmRatio, 2)} : 1）` : 'TalonFX 內建編碼器'}</dd>
          </dl>
          {ff.warnings.map((w) => (
            <div key={w} className="warn">
              {w}
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" type="button" onClick={() => toSim(false)}>
              送到模擬
            </button>
            <button className="btn" type="button" onClick={() => toSim(true)} title="複製一份當「自訂」，在模擬裡自由改">
              複製成自訂再模擬
            </button>
          </div>
          <p className="small muted" style={{ margin: '10px 0 0' }}>
            程式輸出（Java、TalonFX 內建編碼器或 CANcoder）下一版推出。現在可以先把參數卡的灰字（Phoenix 6 轉數制）抄進 Slot0，GravityType 設 Arm_Cosine。
          </p>
        </aside>
      </div>
    </section>
  )
}
