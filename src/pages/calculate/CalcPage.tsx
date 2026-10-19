import { useState } from 'react'
import { useStore } from '../../app/store'
import { ParamCard } from '../../components/ParamCard'
import { Quiz } from '../../components/Quiz'
import { LESSONS } from './lessons'
import { MechanismForm } from './MechanismForm'
import { PARAM_ROWS, KIND_INFO } from './paramSources'
import { ParamSources } from './ParamSources'
import { RatioSweep, ShareMechanism } from './RatioSweep'
import { HelpLink } from '../../components/HelpLink'
import { GUIDE_ANCHOR } from '../guide/guideContent'
import { t } from '../../core/lang'

const f = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function CalcPage() {
  const { mechanism, setMechanism, voltsPerCm, setVoltsPerCm, ff, theory, lessonsDone, markLesson, setCustom, setSimSource, go, shared, dismissShared } = useStore()
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
          <h1 id="t-calc">{t('計算參數', 'Calculate gains')}</h1>
          <p className="lead">
            {t('填入機構資料，右邊的參數卡會即時更新。數字怎麼來的，跟著下方五個關卡一步一步看。', 'Enter your mechanism data and the parameter card on the right updates immediately. To see where each number comes from, follow the five lessons below step by step.')}{' '}
            <HelpLink section={GUIDE_ANCHOR.calc} />
          </p>
        </div>
        <span className="phase">
          {t(`教學關卡 ${done} / ${LESSONS.length}`, `Lessons ${done} / ${LESSONS.length}`)}
        </span>
      </div>

      {shared && (
        <div className={shared.ok ? 'ok' : 'warn'} style={{ marginBottom: 12 }}>
          {shared.text}
          {shared.prev && (
            <>
              {' '}
              <button className="linkbtn" type="button" onClick={() => dismissShared(true)}>
                {t('復原成我原本的', 'Restore mine')}
              </button>
            </>
          )}{' '}
          <button className="linkbtn" type="button" onClick={() => dismissShared(false)}>
            {t('知道了', 'Got it')}
          </button>
        </div>
      )}

      <div className="grid2">
        <div className="stack">
          <MechanismForm m={mechanism} onChange={setMechanism} voltsPerCm={voltsPerCm} onVoltsPerCm={setVoltsPerCm} />

          <div className="panel">
            <h2>{t('教學關卡', 'Lessons')}</h2>
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
                        <div className="goal">{t('學習目標：', 'Goal: ')}{l.goal}</div>
                        <l.Body m={mechanism} ff={ff} kP={theory.feedback.kP} done={lessonsDone[l.id]} />
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
              kS: ff.kS > 0 ? t('你量到的值（機構資料最下面）', 'Your measured value (bottom of the mechanism data)') : t('公式算不出，一定要上機量', 'Can’t be calculated; you must measure it on the robot'),
              kI: t('預設 0，穩態誤差交給 kG', 'Default 0; kG handles steady-state error'),
              kD: t('到位後振盪時再加', 'Add it if it oscillates after arriving'),
              cruise: t(`上限 ${f(ff.maxVelocity, 2)} 的 75%${ff.frictionIncluded ? '（已扣 kS）' : '（沒扣摩擦，實際會更低）'}`, `75% of the ${f(ff.maxVelocity, 2)} limit${ff.frictionIncluded ? ' (kS subtracted)' : ' (friction not subtracted; real limit is lower)'}`),
              accel: t(`上限 ${f(ff.maxAccelUp, 1)} 的 75%${ff.frictionIncluded ? '（已扣 kS）' : '（沒扣摩擦）'}`, `75% of the ${f(ff.maxAccelUp, 1)} limit${ff.frictionIncluded ? ' (kS subtracted)' : ' (friction not subtracted)'}`),
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
              {t(`等效質量：重力 ${f(ff.mass.gravity, 1)} kg、慣性 ${f(ff.mass.inertia, 1)} kg。沒有發現問題。`, `Equivalent mass: gravity ${f(ff.mass.gravity, 1)} kg, inertia ${f(ff.mass.inertia, 1)} kg. No problems found.`)}
            </div>
          )}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn primary" type="button" onClick={() => toSim(false)}>
              {t('送到模擬', 'Send to sim')}
            </button>
            <button className="btn" type="button" onClick={() => toSim(true)} title={t('複製一份當「自訂」，在模擬裡自由改', 'Copy as “Custom” and change it freely in the sim')}>
              {t('複製成自訂再模擬', 'Copy as custom and simulate')}
            </button>
          </div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            {t('參數名稱旁的小字是它怎麼來的：算、算＋量、量、調、限制（游標停在上面看說明）。', 'The small tag next to each gain says where it comes from: calc, calc + measure, measure, tune, limit (hover for details). ')}
            <button className="linkbtn" type="button" onClick={() => document.getElementById('param-sources')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>
              {t('看對照表', 'See the table')}
            </button>
          </p>
        </aside>
      </div>

      <details className="panel scen" style={{ marginTop: 20 }}>
        <summary>
          <b>{t('齒比怎麼選', 'Choosing a gear ratio')}</b>
          <span className="small muted">{t('只換齒比，看跑完全程要多久、停在半空要吃多少電流。', 'Change only the gear ratio and see how long a full move takes and how much current it draws holding mid-air.')}</span>
        </summary>
        <div style={{ marginTop: 12 }}>
          <RatioSweep />
        </div>
      </details>

      <details className="panel scen" style={{ marginTop: 12 }}>
        <summary>
          <b>{t('分享這台電梯', 'Share this elevator')}</b>
          <span className="small muted">{t('把機構資料放進網址傳給隊友，打開就是同一台電梯。', 'Put the mechanism data in a link for teammates; opening it loads the same elevator.')}</span>
        </summary>
        <div style={{ marginTop: 12 }}>
          <ShareMechanism />
        </div>
      </details>

      <div style={{ marginTop: 20 }}>
        <ParamSources />
      </div>
    </section>
  )
}
