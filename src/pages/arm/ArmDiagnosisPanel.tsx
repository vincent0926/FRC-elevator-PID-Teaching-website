import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import type { CheckReport } from '../../core/analysis/checks'
import { describeChange, diagnose, estimateRobotGains, ISSUE_LABEL, ISSUE_ORDER, round3, type Issue, type IssueKey } from '../../core/analysis/diagnose'
import { segment } from '../../core/analysis/segment'
import { CONTROL_PERIOD, type ControllerLocation, type Slot0Gains } from '../../core/controller/slot0'
import type { AlignedLog } from '../../core/log/fieldMap'
import type { ArmParameterSet } from '../../schema/armParameterSet'
import type { SimLogHandoff } from '../../app/simLog'
import { ARM_LESSONS } from './armLessons'
import { useArm } from './armStore'
import { applyArmChange, armGains, armParamsFromGains } from './armTuning'
import { t } from '../../core/lang'

/**
 * 手臂 2F 步驟 1–3：找問題 → 處理一個 → 上機驗證。跟電梯同一套診斷，重力項換成 kG·cos θ。
 * 套用建議會存成手臂的「自訂」，到 3F 選自訂就能預覽。
 */

type GainsSource = 'log' | 'custom' | 'theory' | 'sim'
type Guess = IssueKey | 'none'

const SOURCE_LABEL: Record<GainsSource, string> = t(
  { sim: '3F 模擬用的', log: '從日誌推算', custom: '自訂參數組', theory: '理論值' },
  { sim: 'Used in the 3F sim', log: 'Estimated from the log', custom: 'Custom gain set', theory: 'Theory' },
)

const GAIN_ROWS: [keyof Slot0Gains, string, number][] = [
  ['kS', 'V', 3],
  ['kG', t('V（水平時）', 'V (horizontal)'), 3],
  ['kV', 'V/(rad/s)', 3],
  ['kA', 'V/(rad/s²)', 4],
  ['kP', 'V/rad', 1],
  ['kD', 'V/(rad/s)', 2],
]
const R2D = 180 / Math.PI

export interface ArmDiagnosisPanelProps {
  log: AlignedLog
  report: CheckReport
  logName: string
  onHighlight: (spans: [number, number][] | null) => void
  /** 3F 送來的模擬：模擬時用的參數與閉迴路位置，不用從日誌猜 */
  sim?: SimLogHandoff<ArmParameterSet>
}

export function ArmDiagnosisPanel({ log, report, logName, onHighlight, sim }: ArmDiagnosisPanelProps) {
  const { lessonsDone, go } = useStore()
  const { arm, theory, custom, setCustom, setSource: setSimSource } = useArm()
  const expertUnlocked = ARM_LESSONS.every((l) => lessonsDone[l.id])
  const [expert, setExpert] = useState(false)
  const [location, setLocation] = useState<ControllerLocation>(sim?.location ?? 'talonfx')

  // 匯入時的快照：套用建議會改掉 custom，不能回頭改變這份日誌的分析
  const [sets] = useState<Record<Exclude<GainsSource, 'log'>, ArmParameterSet | null>>(() => ({ custom, theory, sim: sim?.params ?? null }))
  const seg = useMemo(() => segment(log), [log])
  const fallbackSet = sets.custom ?? sets.theory!
  const estimate = useMemo(() => estimateRobotGains(log, armGains(fallbackSet), seg, 'arm'), [log, seg, fallbackSet])
  const [source, setSource] = useState<GainsSource>(() => (sim ? 'sim' : estimate ? 'log' : sets.custom ? 'custom' : 'theory'))
  const effectiveSource: GainsSource = source === 'log' && !estimate ? 'theory' : source !== 'log' && !sets[source] ? 'theory' : source
  const base: ArmParameterSet = useMemo(() => {
    if (effectiveSource === 'log' && estimate) {
      return armParamsFromGains(arm, estimate.gains, { cruiseVelocity: round3(seg.vScale), acceleration: round3(seg.aScale) || fallbackSet.motionMagic.acceleration }, 'measured', t(`從 ${logName} 推算`, `Estimated from ${logName}`))
    }
    const ps = sets[effectiveSource as Exclude<GainsSource, 'log'>] ?? sets.theory!
    return { ...ps, mechanism: arm }
  }, [effectiveSource, estimate, arm, seg, logName, fallbackSet, sets])
  const gains = armGains(base)

  const diag = useMemo(
    () => diagnose(log, report, armGains(base), base.motionMagic, { mechanism: 'arm', statorCurrentLimit: arm.statorCurrentLimit, controlPeriod: CONTROL_PERIOD[location] }),
    [log, report, base, location, arm.statorCurrentLimit],
  )
  const answer: Guess = diag.primary?.key ?? 'none'

  const [guess, setGuess] = useState<Guess | null>(null)
  const [reason, setReason] = useState('')
  const [wrong, setWrong] = useState(0)
  const [solved, setSolved] = useState(false)
  const [applied, setApplied] = useState(false)
  const diagKey = `${effectiveSource}|${location}`
  const [seenKey, setSeenKey] = useState(diagKey)
  if (seenKey !== diagKey) {
    setSeenKey(diagKey)
    setGuess(null)
    setWrong(0)
    setSolved(false)
    setApplied(false)
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
    setCustom(applyArmChange(base, issue.change, `${ISSUE_LABEL[issue.key]}${t('：', ': ')}${describeChange(issue.change, 'arm')}`))
    setSimSource('custom')
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
            建議是「在這組參數上改一個」，所以要先知道錄日誌時手臂跑的是哪一組。
            </>,
            <>
              The advice is “change one thing from this set of gains”, so first you need to know which set the arm was running when the log was recorded.
            </>,
          )}
        </p>
        <div className="seg" role="group" aria-label={t('參數來源', 'Gain source')}>
          {(sim ? (['sim', 'log', 'custom', 'theory'] as GainsSource[]) : (['log', 'custom', 'theory'] as GainsSource[])).map((s) => (
            <button key={s} type="button" aria-pressed={effectiveSource === s} disabled={s === 'log' ? !estimate : !sets[s]} onClick={() => (setSource(s), onHighlight(null))}>
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        <table className="tbl" style={{ marginTop: 10 }}>
          <tbody>
            {GAIN_ROWS.map(([k, unit, d]) => (
              <tr key={k}>
                <th>{k}</th>
                <td className="num">{gains[k].toFixed(d)}</td>
                <td className="small muted">
                  {unit}
                  {effectiveSource === 'log' && estimate?.fromFallback.includes(k) && t(`・日誌推不準，沿用${sets.custom ? '自訂' : '理論值'}`, `・can’t estimate from the log, using ${sets.custom ? 'custom' : 'theory'}`)}
                </td>
              </tr>
            ))}
            <tr>
              <th>Motion Magic</th>
              <td className="num">
                {(base.motionMagic.cruiseVelocity * R2D).toFixed(0)} / {(base.motionMagic.acceleration * R2D).toFixed(0)}
              </td>
              <td className="small muted">{t('°/s、°/s²', '°/s, °/s²')}</td>
            </tr>
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="small">{t('閉迴路在哪裡跑：', 'Where the closed loop runs:')}</span>
          <div className="seg" role="group" aria-label={t('閉迴路位置', 'Closed-loop location')}>
            <button type="button" aria-pressed={location === 'talonfx'} onClick={() => (setLocation('talonfx'), onHighlight(null))}>
              {t('TalonFX（1 kHz）', 'TalonFX (1 kHz)')}
            </button>
            <button type="button" aria-pressed={location === 'roborio'} onClick={() => (setLocation('roborio'), onHighlight(null))}>
              {t('roboRIO（50 Hz）', 'roboRIO (50 Hz)')}
            </button>
          </div>
        </div>
      </div>

      <div className="panel" id="arm-tune-step-1">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{t('步驟 1：找出問題', 'Step 1: find the problem')}</h2>
          <label className="check" title={expertUnlocked ? '' : t('手臂 1F 的教學關卡全部完成才開放', 'Unlocks after finishing all the arm 1F lessons')}>
            <input type="checkbox" checked={expert} disabled={!expertUnlocked} onChange={(e) => setExpert(e.target.checked)} />
            {t('專家模式', 'Expert mode')}{!expertUnlocked && t('（完成手臂 1F 教學關卡後開放）', ' (unlocks after the arm 1F lessons)')}
          </label>
        </div>

        {!expert && !solved && (
          <>
            <p className="small">
              {t(
                <>
                先自己看圖。照順序檢查：<b>物理限制 → 振盪 → 機構問題 → kG → kS → kV → kA → kP → kD</b>。手臂的 kG 看「停在水平附近」的時候最清楚。
                </>,
                <>
                  Look at the charts yourself first. Check in this order: <b>physical limits → oscillation → mechanism problems → kG → kS → kV → kA → kP → kD</b>. An arm’s kG is clearest when it’s “stopped near horizontal”.
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
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('例如：停在水平時紅線一直在 0 上面', 'e.g. stopped at horizontal, the red line stays above 0')} />
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
                        ? t('回授輸出（紅線）是不是一直在 0 附近？角度有沒有緊跟目標？', 'Is the feedback output (red line) staying near 0? Is the angle tracking the target closely?')
                        : t('照順序表從最前面一項一項排除，不要跳著看。', 'Go through the order list from the top, ruling things out one by one; don’t skip around.'))}
                  {wrong === 2 && (diag.primary ? t(`${diag.primary.lookAt}（圖上黃色是要看的地方）`, `${diag.primary.lookAt} (yellow on the chart is where to look)`) : t('看電壓圖的紅線和角度圖：都很乾淨的話，就是沒有問題。', 'Look at the red line on the voltage chart and the angle chart: if both are clean, there’s no problem.'))}
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
            {diag.primary ? <ArmIssueCard issue={diag.primary} primary /> : <div className="ok">{t('前饋和 PID 都沒有明顯問題：回授輸出很小，到位時間與超越量都在容許範圍內。', 'No obvious feedforward or PID problem: feedback output is small, and settling time and overshoot are within limits.')}</div>}
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
                  <ArmIssueCard key={i.key + i.summary} issue={i} />
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
        <div className="panel" id="arm-tune-step-2">
          <h2>{t('步驟 2：處理這一個問題', 'Step 2: fix this one problem')}</h2>
          {diag.primary.change ? (
            <>
              <p className="small">
                {t(
                  <>
                  只改這一個，其他參數不要動：<b>{describeChange(diag.primary.change, 'arm')}</b>
                  </>,
                  <>
                    Change only this one and leave the other gains alone: <b>{describeChange(diag.primary.change, 'arm')}</b>
                  </>,
                )}
              </p>
              {!applied ? (
                <button type="button" className="btn primary" onClick={() => apply(diag.primary!)}>
                  {t('套用並存成「自訂」', 'Apply and save as “Custom”')}
                </button>
              ) : (
                <>
                  <div className="ok">{t('已存成手臂的「自訂」參數。先到 3F 看看改完的樣子，再上機。', 'Saved as the arm’s “Custom” gains. Preview the change in 3F before going to the robot.')}</div>
                  <button type="button" className="btn primary" style={{ marginTop: 10 }} onClick={() => go('sim')}>
                    {t('模擬預覽', 'Preview in sim')}
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="small">{t('這不是改一個數字能解決的，照上面的檢查清單處理，再重錄一份日誌。', 'This can’t be fixed by changing one number. Work through the checklist above, then record a new log.')}</p>
          )}
        </div>
      )}

      {(applied || (showResult && !diag.primary)) && (
        <div className="panel" id="arm-tune-step-3">
          <h2>{t(`步驟 3：${diag.primary ? '上機驗證' : '達標，輸出參數'}`, `Step 3: ${diag.primary ? 'verify on the robot' : 'passed, export the gains'}`)}</h2>
          {diag.primary ? (
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              {t(
                <>
                <li>把上面建議改的那一個參數，改進機器人專案的程式碼（程式碼才是參數的最終依據）。</li>
                <li>照單元零的流程上機：先低速、有人顧 Disable，人不要站在手臂掃過的範圍。</li>
                <li>用同樣的動作（Arm.tuningRoutine）再錄一份日誌，回到這裡匯入，看問題有沒有消失。</li>
                </>,
                <>
                  <li>Put the one gain changed above into the robot project’s code (the code is the final source of truth for gains).</li>
                  <li>Test on the robot following unit 0: start slow, with someone ready to disable, and nobody standing where the arm swings.</li>
                  <li>Record another log doing the same motion (Arm.tuningRoutine), import it here, and see whether the problem is gone.</li>
                </>,
              )}
            </ol>
          ) : (
            <p className="small">{t('把這組參數寫進程式碼並 commit。之後換負載或改手臂，再重新走一次循環。', 'Put this set of gains into the code and commit. If you change the load or the arm later, go around the loop again.')}</p>
          )}
        </div>
      )}
    </>
  )
}

function ArmIssueCard({ issue, primary }: { issue: Issue; primary?: boolean }) {
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
      {issue.change && <p className="small" style={{ margin: '4px 0' }}>{t('建議：', 'Suggestion: ')}{describeChange(issue.change, 'arm')}</p>}
      {issue.checklist && (
        <ul className="small" style={{ paddingLeft: 18, margin: '6px 0 0' }}>
          {issue.checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
