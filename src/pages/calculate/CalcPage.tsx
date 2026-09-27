import { useState } from 'react'
import { useStore } from '../../app/store'
import { ParamCard } from '../../components/ParamCard'
import { Quiz } from '../../components/Quiz'
import { ExportPanel } from './ExportPanel'
import { LESSONS } from './lessons'
import { MechanismForm } from './MechanismForm'
import { PARAM_ROWS, KIND_INFO } from './paramSources'
import { ParamSources } from './ParamSources'

const f = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function CalcPage() {
  const { mechanism, setMechanism, voltsPerCm, setVoltsPerCm, ff, theory, lessonsDone, markLesson, setCustom, setSimSource, go } = useStore()
  const [open, setOpen] = useState<string | null>(() => LESSONS.find((l) => !lessonsDone[l.id])?.id ?? null)
  const done = LESSONS.filter((l) => lessonsDone[l.id]).length

  const toSim = (asCustom: boolean) => {
    if (asCustom) {
      setCustom({ ...theory, source: 'custom', createdAt: new Date().toISOString() })
      setSimSource('custom')
    } else setSimSource('theory')
    go('sim')
  }

  return (
    <section aria-labelledby="t-calc">
      <div className="head">
        <div>
          <h1 id="t-calc">計算參數</h1>
          <p className="lead">填入機構資料，右邊的參數卡會即時更新。數字怎麼來的，跟著下方五個關卡一步一步看。</p>
        </div>
        <span className="phase">
          教學關卡 {done} / {LESSONS.length}
        </span>
      </div>

      <div className="grid2">
        <div className="stack">
          <MechanismForm m={mechanism} onChange={setMechanism} voltsPerCm={voltsPerCm} onVoltsPerCm={setVoltsPerCm} />

          <div className="panel">
            <h2>教學關卡</h2>
            <ol className="lessons">
              {LESSONS.map((l) => {
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
                        <l.Body m={mechanism} ff={ff} kP={theory.feedback.kP} />
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
          <ParamCard
            ps={theory}
            tags={Object.fromEntries(
              PARAM_ROWS.map((r) => [
                r.name,
                <span key={r.name} className={'src-mini src-' + r.kind} title={KIND_INFO[r.kind].label}>
                  {KIND_INFO[r.kind].short}
                </span>,
              ]),
            )}
            notes={{
              kS: '公式算不出，一定要上機量',
              kI: '預設 0，穩態誤差交給 kG',
              kD: '到位後振盪時再加',
              cruise: `上限 ${f(ff.maxVelocity, 2)} 的 75%`,
              accel: `上限 ${f(ff.maxAccelUp, 1)} 的 75%`,
            }}
          />
          {ff.warnings.length ? (
            ff.warnings.map((w) => (
              <div key={w} className="warn">
                {w}
              </div>
            ))
          ) : (
            <div className="ok">
              等效質量：重力 {f(ff.mass.gravity, 1)} kg、慣性 {f(ff.mass.inertia, 1)} kg。沒有發現問題。
            </div>
          )}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn primary" type="button" onClick={() => toSim(false)}>
              送到模擬
            </button>
            <button className="btn" type="button" onClick={() => toSim(true)} title="複製一份當「自訂」，在模擬裡自由改">
              複製成自訂再模擬
            </button>
          </div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            參數名稱旁的小字是它怎麼來的：算、算＋量、量、決定。
            <button className="linkbtn" type="button" onClick={() => document.getElementById('param-sources')?.scrollIntoView({ behavior: 'smooth' })}>
              看對照表
            </button>
          </p>
          <hr style={{ border: 0, borderTop: '1px solid var(--line-2)', margin: '18px 0' }} />
          <ExportPanel ps={theory} />
        </aside>
      </div>

      <div style={{ marginTop: 20 }}>
        <ParamSources />
      </div>
    </section>
  )
}
