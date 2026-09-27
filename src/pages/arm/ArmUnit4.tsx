import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { Chart, type ChartSeries } from '../../components/Chart'
import { computeArmFeedforward } from '../../core/arm/feedforward'
import { armSampleAlignedLog } from '../../core/arm/sampleLog'
import { DEFAULT_ARM } from '../../schema/armParameterSet'
import { PASS_SCORE, grade, type Answers } from '../learn/assessment'
import { Multi, Radio } from '../learn/Unit4'
import { ARM_CASES, ARM_LISTS } from './armAssessment'
import { ARM_LOG_SCENARIOS } from './armLogScenarios'
import { buildArmTheory, useArm } from './armStore'

/** 手臂 4F 單元四：期末檢核。一份沒看過的手臂日誌，照七個問題寫出診斷與推理。 */

const EMPTY: Answers = { symptom: null, evidence: [], component: null, change: null, why: '', expect: null, safety: [] }
const R2D = 180 / Math.PI

export function ArmUnit4() {
  const { lessonsDone, markLesson } = useStore()
  const { arm, ff, theory } = useArm()
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * ARM_CASES.length))
  const [a, setA] = useState<Answers>(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const c = ARM_CASES[idx]
  const L = ARM_LISTS

  // 手臂太輕（kG 很小）或動不了時看不出差別，改用範例手臂出題
  const own = Math.abs(ff.kG) >= 0.1 && ff.maxVelocity > 0
  const base = useMemo(() => {
    if (own) return { arm, ff, theory }
    const f2 = computeArmFeedforward(DEFAULT_ARM)
    return { arm: DEFAULT_ARM, ff: f2, theory: buildArmTheory(DEFAULT_ARM, f2, 0.3) }
  }, [own, arm, ff, theory])

  const log = useMemo(() => {
    const sc = ARM_LOG_SCENARIOS.find((s) => s.id === c.scenario)!
    const l = armSampleAlignedLog({ arm: base.arm, ff: base.ff, ...sc.build(base.theory, base.ff) })
    const col = (k: keyof typeof l.cols, scale = 1) => {
      const v = l.cols[k] ?? new Float64Array(l.t.length)
      return scale === 1 ? v : Float64Array.from(v, (x) => x * scale)
    }
    const pos: ChartSeries[] = [
      { label: '目標（軌跡）', color: '--steel', dash: true, values: col('reference', R2D) },
      { label: '角度', color: '--blue', values: col('position', R2D) },
    ]
    const volt: ChartSeries[] = [
      { label: '輸出電壓', color: '--ink-2', values: col('appliedVolts') },
      { label: '前饋', color: '--green', values: col('feedforwardOutput') },
      { label: '回授（P+I+D）', color: '--red', values: col('closedLoopOutput') },
      { label: '電池電壓', color: '--amber', dash: true, values: col('supplyVoltage') },
    ]
    const vel: ChartSeries[] = [
      { label: '參考角速度', color: '--steel', dash: true, values: col('referenceSlope', R2D) },
      { label: '角速度', color: '--blue', values: col('velocity', R2D) },
    ]
    return { t: l.t, pos, volt, vel }
  }, [c.scenario, base])

  const g = submitted ? grade(c, a, L) : null
  const set = (patch: Partial<Answers>) => setA({ ...a, ...patch })
  const next = () => {
    setIdx((i) => (i + 1 + Math.floor(Math.random() * (ARM_CASES.length - 1))) % ARM_CASES.length)
    setA(EMPTY)
    setSubmitted(false)
  }
  const submit = () => {
    setSubmitted(true)
    if (grade(c, a, L).passed) markLesson('arm-unit4')
  }

  return (
    <div className="body">
      <div className="goal lgoal">學習目標：拿到一份沒看過的手臂日誌，自己說出發生什麼事、證據在哪、該改什麼、為什麼、改完預期會怎樣、上機前要檢查什麼。</div>
      <p className="small">
        {own ? '這份日誌是用你 1F 的手臂模擬出來的' : '你 1F 的手臂 kG 太小或動不了，這份日誌改用範例手臂模擬'}
        ，有一個地方設錯了（不告訴你是哪個）。分數看推理：證據和上機前檢查佔一半（{PASS_SCORE} 分及格，而且上機前檢查不能選錯）。資料是模擬的，不是實機。
        {lessonsDone['arm-unit4'] && ' 你已經通過過一次，可以換一份再練。'}
      </p>
      <Chart title="角度" x={log.t} series={log.pos} height={200} yLabel="°" />
      <Chart title="電壓" x={log.t} series={log.volt} height={200} yLabel="V" />
      <Chart title="角速度" x={log.t} series={log.vel} height={150} yLabel="°/s" />

      <h3>1. 發生什麼事？</h3>
      <Radio name="aq1" options={L.symptoms} value={a.symptom} onChange={(v) => set({ symptom: v })} disabled={submitted} />
      <h3>2. 證據是什麼？（可以複選，選錯會扣分）</h3>
      <Multi options={L.evidence} value={a.evidence} onChange={(v) => set({ evidence: v })} disabled={submitted} />
      <h3>3. 最可能是哪個參數或設定？</h3>
      <Radio name="aq3" options={L.components} value={a.component} onChange={(v) => set({ component: v })} disabled={submitted} />
      <h3>4. 第一個要改什麼？</h3>
      <Radio name="aq4" options={L.changes} value={a.change} onChange={(v) => set({ change: v })} disabled={submitted} />
      <h3>5. 為什麼？（用自己的話寫，交出後跟參考推理比）</h3>
      <textarea className="why-box" value={a.why} disabled={submitted} onChange={(e) => set({ why: e.target.value })} rows={3} placeholder="例如：停在水平時回授一直是正的，所以……" />
      <h3>6. 改完之後預期會看到什麼？</h3>
      <Radio name="aq6" options={L.expects} value={a.expect} onChange={(v) => set({ expect: v })} disabled={submitted} />
      <h3>7. 上機前要做哪些檢查？（可以複選）</h3>
      <Multi options={L.safety} value={a.safety} onChange={(v) => set({ safety: v })} disabled={submitted} />

      {!submitted ? (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" type="button" onClick={submit} disabled={!a.symptom || !a.component || !a.change || !a.expect}>
            交出
          </button>
          <span className="small muted">第 1、3、4、6 題要選才能交出。</span>
        </div>
      ) : (
        g && (
          <div className="stack" style={{ marginTop: 12 }}>
            <div className={g.passed ? 'ok' : 'warn'}>
              {g.score} / {g.max} 分，
              {g.passed ? '通過。' : g.score >= PASS_SCORE ? '分數夠了，但上機前檢查沒過（選了不安全的做法，或一項都沒選）：安全不能用其他題的分數換。' : '還沒通過，看完下面的說明換一份再試。'}
            </div>
            <table className="tbl">
              <tbody>
                {g.parts.map((p) => (
                  <tr key={p.q}>
                    <td>{p.q}</td>
                    <td className={'num ' + (p.got === p.of ? 'pass' : 'fail')}>
                      {p.got} / {p.of}
                    </td>
                    <td className="small">{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="note">
              <b>5. 參考推理：</b>
              {c.why}
              {a.why.trim() && (
                <>
                  <br />
                  <b>你寫的：</b>
                  {a.why}
                </>
              )}
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              這份日誌其實是：{ARM_LOG_SCENARIOS.find((s) => s.id === c.scenario)!.label}。到手臂 2F 用同一個範例日誌，可以看診斷規則怎麼判斷。
            </p>
            <button className="btn" type="button" onClick={next}>
              換一份日誌
            </button>
          </div>
        )
      )}
    </div>
  )
}
