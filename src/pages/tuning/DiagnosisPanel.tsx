import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { applyChange, gainsOf, paramsFromGains } from '../../core/analysis/apply'
import type { CheckReport } from '../../core/analysis/checks'
import { describeChange, diagnose, estimateRobotGains, ISSUE_LABEL, ISSUE_ORDER, round3, type Issue, type IssueKey } from '../../core/analysis/diagnose'
import { segment } from '../../core/analysis/segment'
import { CONTROL_PERIOD, type ControllerLocation, type Slot0Gains } from '../../core/controller/slot0'
import type { AlignedLog } from '../../core/log/fieldMap'
import type { ParameterSet } from '../../schema/parameterSet'
import type { SimLogHandoff } from '../../app/simLog'
import { LESSONS } from '../calculate/lessons'
import { t } from '../../core/lang'

/**
 * 步驟 1–3：找問題 → 處理一個 → 上機驗證。
 * 引導模式：先讓隊員自己選問題、寫理由，答錯給三層提示；專家模式（教學關卡全部完成才開放）直接看結果。
 */

type GainsSource = 'log' | 'tuning' | 'custom' | 'theory' | 'sim'
type Guess = IssueKey | 'none'

const SOURCE_LABEL: Record<GainsSource, string> = {
  sim: t('3F 模擬用的', 'Used in the 3F sim'),
  log: t('從日誌推算', 'Estimated from the log'),
  tuning: t('上次的調參建議值', 'Last tuning suggestion'),
  custom: t('自訂參數組', 'Custom gain set'),
  theory: t('理論值', 'Theory'),
}

const GAIN_ROWS: [keyof Slot0Gains, string, number][] = [
  ['kS', 'V', 3],
  ['kG', 'V', 3],
  ['kV', 'V/(m/s)', 3],
  ['kA', 'V/(m/s²)', 4],
  ['kP', 'V/m', 1],
  ['kD', 'V/(m/s)', 2],
]

export interface DiagnosisPanelProps {
  log: AlignedLog
  report: CheckReport
  logName: string
  onHighlight: (spans: [number, number][] | null) => void
  /** 3F 送來的模擬：模擬時用的參數與閉迴路位置，不用從日誌猜 */
  sim?: SimLogHandoff<ParameterSet>
}

export function DiagnosisPanel({ log, report, logName, onHighlight, sim }: DiagnosisPanelProps) {
  const { mechanism, theory, custom, tuning, setTuning, rounds, addRound, clearRounds, lessonsDone, setSimSource, go } = useStore()
  const expertUnlocked = LESSONS.every((l) => lessonsDone[l.id])
  const [expert, setExpert] = useState(false)
  const [location, setLocation] = useState<ControllerLocation>(sim?.location ?? 'talonfx')

  // ---------- 機器人上當時的參數 ----------
  // 匯入時的快照：套用建議會改掉 tuning，不能讓它回頭改變這份日誌的分析（換日誌時父層用 key 重新掛載）
  const [sets] = useState<Record<Exclude<GainsSource, 'log'>, ParameterSet | null>>(() => ({ tuning, custom, theory, sim: sim?.params ?? null }))
  const seg = useMemo(() => segment(log), [log])
  const [source, setSource] = useState<GainsSource>(() => (sim ? 'sim' : log.cols.feedforwardOutput && log.cols.closedLoopOutput ? 'log' : sets.tuning ? 'tuning' : 'theory'))
  // 推不準的欄位用哪一組補：有調參建議值就用它（多半是上一輪放上機器人的），否則理論值
  const fallbackSet = sets.tuning ?? sets.custom ?? sets.theory!
  const estimate = useMemo(() => estimateRobotGains(log, gainsOf(fallbackSet), seg), [log, seg, fallbackSet])
  const effectiveSource: GainsSource = source === 'log' && !estimate ? 'theory' : source !== 'log' && !sets[source] ? 'theory' : source
  const base: ParameterSet = useMemo(() => {
    if (effectiveSource === 'log' && estimate) {
      // Motion Magic 也從日誌看：參考速度、加速度的量級
      return paramsFromGains(mechanism, estimate.gains, { cruiseVelocity: round3(seg.vScale), acceleration: round3(seg.aScale) || fallbackSet.motionMagic.acceleration }, 'measured', t(`從 ${logName} 推算`, `Estimated from ${logName}`))
    }
    const ps = sets[effectiveSource as Exclude<GainsSource, 'log'>] ?? sets.theory!
    return { ...ps, mechanism }
  }, [effectiveSource, estimate, mechanism, seg, logName, fallbackSet, sets])
  const gains = gainsOf(base)

  const diag = useMemo(
    () => diagnose(log, report, gainsOf(base), base.motionMagic, { statorCurrentLimit: mechanism.statorCurrentLimit, controlPeriod: CONTROL_PERIOD[location] }),
    [log, report, base, location, mechanism.statorCurrentLimit],
  )
  const answer: Guess = diag.primary?.key ?? 'none'

  // ---------- 引導模式 ----------
  const [guess, setGuess] = useState<Guess | null>(null)
  const [reason, setReason] = useState('')
  const [wrong, setWrong] = useState(0)
  const [solved, setSolved] = useState(false)
  const [applied, setApplied] = useState(false)
  // 換參數來源或閉迴路位置，診斷結果就不一樣，重新來（換日誌時父層重新掛載）
  const diagKey = `${effectiveSource}|${location}`
  const [seenKey, setSeenKey] = useState(diagKey)
  if (seenKey !== diagKey) {
    setSeenKey(diagKey)
    setGuess(null)
    setWrong(0)
    setSolved(false)
    setApplied(false)
  }
  const changeSource = (s: GainsSource) => {
    setSource(s)
    onHighlight(null)
  }
  const changeLocation = (l: ControllerLocation) => {
    setLocation(l)
    onHighlight(null)
  }

  const showResult = expert || solved
  const submit = () => {
    if (!guess) return
    if (guess === answer) {
      setSolved(true)
      if (diag.primary) onHighlight(diag.primary.spans)
    } else {
      const w = wrong + 1
      setWrong(w)
      if (w >= 2 && diag.primary) onHighlight(diag.primary.spans)
    }
  }

  const apply = (issue: Issue) => {
    if (!issue.change) return
    const note = `${ISSUE_LABEL[issue.key]}${t('：', ': ')}${describeChange(issue.change)}`
    setTuning(applyChange(base, issue.change, note))
    addRound({ at: new Date().toISOString(), logName, issue: ISSUE_LABEL[issue.key], change: describeChange(issue.change) })
    setApplied(true)
  }

  const guessedReal = guess && guess !== 'none' && diag.issues.some((i) => i.key === guess)

  return (
    <>
      <div className="panel">
        <h2>{t('機器人上當時的參數', 'Gains on the robot at the time')}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          {t(
            <>
            建議是「在這組參數上改一個」，所以要先知道錄日誌時機器人跑的是哪一組。
            </>,
            <>
              The advice is “change one thing from this set of gains”, so first you need to know which set the robot was running when the log was recorded.
            </>,
          )}
        </p>
        <div className="row">
          <div className="seg" role="group" aria-label={t('參數來源', 'Gain source')}>
            {(sim ? (['sim', 'log', 'tuning', 'custom', 'theory'] as GainsSource[]) : (['log', 'tuning', 'custom', 'theory'] as GainsSource[])).map((s) => (
              <button key={s} type="button" aria-pressed={effectiveSource === s} disabled={s === 'log' ? !estimate : !sets[s as Exclude<GainsSource, 'log'>]} onClick={() => changeSource(s)}>
                {SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <table className="tbl" style={{ marginTop: 10 }}>
          <tbody>
            {GAIN_ROWS.map(([k, unit, d]) => (
              <tr key={k}>
                <th>{k}</th>
                <td className="num">{gains[k].toFixed(d)}</td>
                <td className="small muted">
                  {unit}
                  {effectiveSource === 'log' && estimate?.fromFallback.includes(k) && t('・日誌推不準，沿用', '・can’t estimate from the log, using ') + (sets.tuning ? t('調參建議值', 'tuning suggestion') : sets.custom ? t('自訂', 'custom') : t('理論值', 'theory'))}
                </td>
              </tr>
            ))}
            <tr>
              <th>Motion Magic</th>
              <td className="num">
                {base.motionMagic.cruiseVelocity.toFixed(2)} / {base.motionMagic.acceleration.toFixed(1)}
              </td>
              <td className="small muted">{t('m/s、m/s²', 'm/s, m/s²')}</td>
            </tr>
          </tbody>
        </table>
        {effectiveSource === 'log' && <p className="small muted">{t('由日誌的前饋欄位與回授欄位反推。跟你記得的不一樣時，以程式碼裡的為準，改選其他來源。', 'Worked back from the log’s feedforward and feedback fields. If it doesn’t match what you remember, trust the code and pick another source.')}</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <span className="small">{t('閉迴路在哪裡跑：', 'Where the closed loop runs:')}</span>
          <div className="seg" role="group" aria-label={t('閉迴路位置', 'Closed-loop location')}>
            <button type="button" aria-pressed={location === 'talonfx'} onClick={() => changeLocation('talonfx')}>
              {t('TalonFX（1 kHz）', 'TalonFX (1 kHz)')}
            </button>
            <button type="button" aria-pressed={location === 'roborio'} onClick={() => changeLocation('roborio')}>
              {t('roboRIO（50 Hz）', 'roboRIO (50 Hz)')}
            </button>
          </div>
        </div>
      </div>

      <div className="panel" id="tune-step-1">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{t('步驟 1：找出問題', 'Step 1: find the problem')}</h2>
          <label className="check" title={expertUnlocked ? '' : t('1F 的教學關卡全部完成才開放', 'Unlocks after finishing all the 1F lessons')}>
            <input type="checkbox" checked={expert} disabled={!expertUnlocked} onChange={(e) => setExpert(e.target.checked)} />
            {t('專家模式', 'Expert mode')}{!expertUnlocked && t('（完成 1F 教學關卡後開放）', ' (unlocks after the 1F lessons)')}
          </label>
        </div>

        {!expert && !solved && (
          <>
            <p className="small">
              {t(
                <>
                先自己看圖。照順序檢查：<b>物理限制 → 振盪 → 機構問題 → kG → kS → kV → kA → kP → kD</b>。前面的問題沒解決，後面的判斷都不準。
                </>,
                <>
                  Look at the charts yourself first. Check in this order: <b>physical limits → oscillation → mechanism problems → kG → kS → kV → kA → kP → kD</b>. Until the earlier problems are fixed, later judgments aren’t reliable.
                </>,
              )}
            </p>
            <label className="f">
              {t('這份日誌最優先要處理的是', 'The top-priority problem in this log is')}
              <span className="inp">
                <select value={guess ?? ''} onChange={(e) => setGuess((e.target.value || null) as Guess | null)}>
                  <option value="">{t('選一個', 'Pick one')}</option>
                  {ISSUE_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {ISSUE_LABEL[k]}
                    </option>
                  ))}
                  <option value="none">{t('沒有問題，已經達標', 'No problem, it already passes')}</option>
                </select>
              </span>
            </label>
            <label className="f" style={{ display: 'block', marginTop: 8 }}>
              {t('理由（看到圖上的什麼？）', 'Why? (what do you see on the chart?)')}
              <span className="inp">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('例如：靜止時紅線一直在 0 上面', 'e.g. at rest the red line stays above 0')} />
              </span>
            </label>
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn primary" disabled={!guess || reason.trim().length < 4} onClick={submit}>
                {t('送出', 'Submit')}
              </button>
              {wrong >= 3 && (
                <button type="button" className="btn" onClick={() => setSolved(true)}>
                  {t('看答案', 'Show answer')}
                </button>
              )}
              {reason.trim().length < 4 && <span className="small muted">{t('寫一句理由才能送出', 'Write a reason to submit')}</span>}
            </div>
            <div aria-live="polite">
              {wrong > 0 && (
                <div className="note">
                  <b>{t(`提示 ${Math.min(wrong, 3)}：`, `Hint ${Math.min(wrong, 3)}: `)}</b>
                  {wrong === 1 &&
                    (guessedReal
                      ? t(`「${ISSUE_LABEL[guess as IssueKey]}」確實也有問題，但不是最優先的。順序表上有更前面的。`, `“${ISSUE_LABEL[guess as IssueKey]}” is a real problem too, but not the top priority. Something earlier in the order applies.`)
                      : answer === 'none'
                        ? t('回授輸出（紅線）是不是一直在 0 附近？位置有沒有緊跟目標？', 'Is the feedback output (red line) staying near 0? Is the position tracking the target closely?')
                        : t('照順序表從最前面一項一項排除，不要跳著看。', 'Go through the order list from the top, ruling things out one by one; don’t skip around.'))}
                  {wrong === 2 && (diag.primary ? t(`${diag.primary.lookAt}（圖上黃色是要看的地方）`, `${diag.primary.lookAt} (yellow on the chart is where to look)`) : t('看電壓圖的紅線和位置圖：都很乾淨的話，就是沒有問題。', 'Look at the red line on the voltage chart and the position chart: if both are clean, there’s no problem.'))}
                  {wrong >= 3 && (diag.primary ? diag.primary.evidence.join(t('；', '; ')) : t('回授輸出很小、到位時間和超越量都在容許範圍內。', 'Feedback output is small, and settling time and overshoot are within limits.'))}
                </div>
              )}
            </div>
          </>
        )}

        {showResult && (
          <div aria-live="polite">
            {!expert && solved && guess === answer && <div className="ok">{t('答對了。對照一下下面的數字，跟你寫的理由一樣嗎？', 'Correct. Compare with the numbers below: do they match your reason?')}</div>}
            {!expert && solved && guess !== answer && <div className="note">{t(`答案是「${answer === 'none' ? '沒有問題' : ISSUE_LABEL[answer]}」。讀一下下面的根據，下次試著自己找。`, `The answer is “${answer === 'none' ? 'No problem' : ISSUE_LABEL[answer]}”. Read the evidence below and try to find it yourself next time.`)}</div>}
            {diag.primary ? <IssueCard issue={diag.primary} primary /> : <div className="ok">{t('前饋和 PID 都沒有明顯問題：回授輸出很小，到位時間與超越量都在容許範圍內。', 'No obvious feedforward or PID problem: feedback output is small, and settling time and overshoot are within limits.')}</div>}
            {expert && diag.issues.length > 1 && (
              <details style={{ marginTop: 10 }}>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  {t(
                    <>
                    其他也偵測到的問題（先處理上面那個，這些改完重錄再看）
                    </>,
                    <>
                      Other problems also detected (fix the one above first, then re-record and check these)
                    </>,
                  )}
                </summary>
                {diag.issues.slice(1).map((i) => (
                  <IssueCard key={i.key} issue={i} />
                ))}
              </details>
            )}
          </div>
        )}
        {diag.notes.length > 0 && (
          <ul className="small muted" style={{ paddingLeft: 18, marginBottom: 0 }}>
            {diag.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      {showResult && diag.primary && (
        <div className="panel" id="tune-step-2">
          <h2>{t('步驟 2：處理這一個問題', 'Step 2: fix this one problem')}</h2>
          {diag.primary.change ? (
            <>
              <p className="small">
                {t(
                  <>
                  只改這一個，其他參數不要動：<b>{describeChange(diag.primary.change)}</b>
                  </>,
                  <>
                    Change only this one and leave the other gains alone: <b>{describeChange(diag.primary.change)}</b>
                  </>,
                )}
              </p>
              {!applied ? (
                <button type="button" className="btn primary" onClick={() => apply(diag.primary!)}>
                  {t('套用成調參建議值', 'Apply as tuning suggestion')}
                </button>
              ) : (
                <>
                  <div className="ok">{t('已存成「調參建議值」。先到模擬看看改完的樣子，再上機。', 'Saved as “Tuning suggestion”. Preview the change in the sim before going to the robot.')}</div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        setSimSource('tuning')
                        go('sim')
                      }}
                    >
                      {t('模擬預覽', 'Preview in sim')}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="small">{t('這不是改參數能解決的，照上面的檢查清單處理機構，再重錄一份日誌。', 'This can’t be fixed by changing gains. Work through the checklist above on the mechanism, then record a new log.')}</p>
          )}
        </div>
      )}

      {(applied || (showResult && !diag.primary)) && (
        <div className="panel" id="tune-step-3">
          <h2>{t(`步驟 3：${diag.primary ? '上機驗證' : '達標，輸出參數'}`, `Step 3: ${diag.primary ? 'verify on the robot' : 'passed, export the gains'}`)}</h2>
          {diag.primary ? (
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              {t(
                <>
                <li>把上面建議改的那一個參數，改進機器人專案的程式碼（程式碼才是參數的最終依據）。</li>
                <li>照單元零的流程上機：先低速、有人顧 Disable。</li>
                <li>用同樣的動作再錄一份日誌，回到這裡匯入，看問題有沒有消失。</li>
                </>,
                <>
                  <li>Put the one gain changed above into the robot project’s code (the code is the final source of truth for gains).</li>
                  <li>Test on the robot following unit 0: start slow, with someone ready to disable.</li>
                  <li>Record another log doing the same motion, import it here, and see whether the problem is gone.</li>
                </>,
              )}
            </ol>
          ) : (
            <p className="small">{t('把這組參數寫進程式碼並 commit。之後換機構或加重量，再重新走一次循環。', 'Put this set of gains into the code and commit. If you change the mechanism or add weight later, go around the loop again.')}</p>
          )}
        </div>
      )}

      {rounds.length > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{t('調參歷程', 'Tuning history')}</h2>
            <button type="button" className="linkbtn small" onClick={clearRounds}>
              {t('清除', 'Clear')}
            </button>
          </div>
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('日誌', 'Log')}</th>
                <th>{t('問題', 'Problem')}</th>
                <th>{t('改了什麼', 'What changed')}</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r, i) => (
                <tr key={r.at}>
                  <td>{i + 1}</td>
                  <td className="small">{r.logName}</td>
                  <td className="small">{r.issue}</td>
                  <td className="small">{r.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {t(
              <>
              同一個問題連續出現三次以上還沒改善，多半是機構或資料有問題，不要一直往同一個方向加。
              </>,
              <>
                If the same problem shows up three or more times in a row without improving, it’s most likely the mechanism or the data; don’t keep pushing in the same direction.
              </>,
            )}
          </p>
        </div>
      )}
    </>
  )
}

function IssueCard({ issue, primary }: { issue: Issue; primary?: boolean }) {
  return (
    <div className={primary ? 'issue primary' : 'issue'}>
      <b>
        {ISSUE_LABEL[issue.key]}
        {primary && <span className="chip" style={{ marginLeft: 8 }}>{t('第一優先', 'Top priority')}</span>}
      </b>
      <p className="small" style={{ margin: '4px 0' }}>
        {issue.summary}
      </p>
      <ul className="small" style={{ paddingLeft: 18, margin: '4px 0' }}>
        {issue.evidence.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {issue.change && <p className="small" style={{ margin: '4px 0' }}>{t('建議：', 'Suggestion: ')}{describeChange(issue.change)}</p>}
      {issue.checklist && (
        <>
          <p className="small" style={{ margin: '6px 0 2px' }}>
            {t('檢查清單：', 'Checklist:')}
          </p>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            {issue.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
