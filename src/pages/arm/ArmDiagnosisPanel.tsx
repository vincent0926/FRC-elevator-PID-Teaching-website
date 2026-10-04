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

/**
 * 手臂 2F 步驟 1–3：找問題 → 處理一個 → 上機驗證。跟電梯同一套診斷，重力項換成 kG·cos θ。
 * 套用建議會存成手臂的「自訂」，到 3F 選自訂就能預覽。
 */

type GainsSource = 'log' | 'custom' | 'theory' | 'sim'
type Guess = IssueKey | 'none'

const SOURCE_LABEL: Record<GainsSource, string> = { sim: '3F 模擬用的', log: '從日誌推算', custom: '自訂參數組', theory: '理論值' }

const GAIN_ROWS: [keyof Slot0Gains, string, number][] = [
  ['kS', 'V', 3],
  ['kG', 'V（水平時）', 3],
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
      return armParamsFromGains(arm, estimate.gains, { cruiseVelocity: round3(seg.vScale), acceleration: round3(seg.aScale) || fallbackSet.motionMagic.acceleration }, 'measured', `從 ${logName} 推算`)
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
    setCustom(applyArmChange(base, issue.change, `${ISSUE_LABEL[issue.key]}：${describeChange(issue.change, 'arm')}`))
    setSimSource('custom')
    setApplied(true)
  }
  const guessedReal = guess && guess !== 'none' && diag.issues.some((i) => i.key === guess)

  return (
    <>
      <div className="panel">
        <h2>機器人上當時的參數</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          建議是「在這組參數上改一個」，所以要先知道錄日誌時手臂跑的是哪一組。
        </p>
        <div className="seg" role="group" aria-label="參數來源">
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
                  {effectiveSource === 'log' && estimate?.fromFallback.includes(k) && `・日誌推不準，沿用${sets.custom ? '自訂' : '理論值'}`}
                </td>
              </tr>
            ))}
            <tr>
              <th>Motion Magic</th>
              <td className="num">
                {(base.motionMagic.cruiseVelocity * R2D).toFixed(0)} / {(base.motionMagic.acceleration * R2D).toFixed(0)}
              </td>
              <td className="small muted">°/s、°/s²</td>
            </tr>
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="small">閉迴路在哪裡跑：</span>
          <div className="seg" role="group" aria-label="閉迴路位置">
            <button type="button" aria-pressed={location === 'talonfx'} onClick={() => (setLocation('talonfx'), onHighlight(null))}>
              TalonFX（1 kHz）
            </button>
            <button type="button" aria-pressed={location === 'roborio'} onClick={() => (setLocation('roborio'), onHighlight(null))}>
              roboRIO（50 Hz）
            </button>
          </div>
        </div>
      </div>

      <div className="panel" id="arm-tune-step-1">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>步驟 1：找出問題</h2>
          <label className="check" title={expertUnlocked ? '' : '手臂 1F 的教學關卡全部完成才開放'}>
            <input type="checkbox" checked={expert} disabled={!expertUnlocked} onChange={(e) => setExpert(e.target.checked)} />
            專家模式{!expertUnlocked && '（完成手臂 1F 教學關卡後開放）'}
          </label>
        </div>

        {!expert && !solved && (
          <>
            <p className="small">
              先自己看圖。照順序檢查：<b>物理限制 → 振盪 → 機構問題 → kG → kS → kV → kA → kP → kD</b>。手臂的 kG 看「停在水平附近」的時候最清楚。
            </p>
            <label className="f">
              這份日誌最優先要處理的是
              <span className="inp">
                <select value={guess ?? ''} onChange={(e) => setGuess((e.target.value || null) as Guess | null)}>
                  <option value="">選一個</option>
                  {ISSUE_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {ISSUE_LABEL[k]}
                    </option>
                  ))}
                  <option value="none">沒有問題，已經達標</option>
                </select>
              </span>
            </label>
            <label className="f" style={{ display: 'block', marginTop: 8 }}>
              理由（看到圖上的什麼？）
              <span className="inp">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：停在水平時紅線一直在 0 上面" />
              </span>
            </label>
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn primary" disabled={!guess || reason.trim().length < 4} onClick={submit}>
                送出
              </button>
              {wrong >= 3 && (
                <button type="button" className="btn" onClick={() => setSolved(true)}>
                  看答案
                </button>
              )}
              {reason.trim().length < 4 && <span className="small muted">寫一句理由才能送出</span>}
            </div>
            <div aria-live="polite">
              {wrong > 0 && (
                <div className="note">
                  <b>提示 {Math.min(wrong, 3)}：</b>
                  {wrong === 1 &&
                    (guessedReal
                      ? `「${ISSUE_LABEL[guess as IssueKey]}」確實也有問題，但不是最優先的。順序表上有更前面的。`
                      : answer === 'none'
                        ? '回授輸出（紅線）是不是一直在 0 附近？角度有沒有緊跟目標？'
                        : '照順序表從最前面一項一項排除，不要跳著看。')}
                  {wrong === 2 && (diag.primary ? `${diag.primary.lookAt}（圖上黃色是要看的地方）` : '看電壓圖的紅線和角度圖：都很乾淨的話，就是沒有問題。')}
                  {wrong >= 3 && (diag.primary ? diag.primary.evidence.join('；') : '回授輸出很小、到位時間和超越量都在容許範圍內。')}
                </div>
              )}
            </div>
          </>
        )}

        {showResult && (
          <div aria-live="polite">
            {!expert && solved && guess === answer && <div className="ok">答對了。對照一下下面的數字，跟你寫的理由一樣嗎？</div>}
            {!expert && solved && guess !== answer && <div className="note">答案是「{answer === 'none' ? '沒有問題' : ISSUE_LABEL[answer]}」。讀一下下面的根據，下次試著自己找。</div>}
            {diag.primary ? <ArmIssueCard issue={diag.primary} primary /> : <div className="ok">前饋和 PID 都沒有明顯問題：回授輸出很小，到位時間與超越量都在容許範圍內。</div>}
            {expert && diag.issues.length > 1 && (
              <details style={{ marginTop: 10 }}>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  其他也偵測到的問題（先處理上面那個，這些改完重錄再看）
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
          <h2>步驟 2：處理這一個問題</h2>
          {diag.primary.change ? (
            <>
              <p className="small">
                只改這一個，其他參數不要動：<b>{describeChange(diag.primary.change, 'arm')}</b>
              </p>
              {!applied ? (
                <button type="button" className="btn primary" onClick={() => apply(diag.primary!)}>
                  套用並存成「自訂」
                </button>
              ) : (
                <>
                  <div className="ok">已存成手臂的「自訂」參數。先到 3F 看看改完的樣子，再上機。</div>
                  <button type="button" className="btn primary" style={{ marginTop: 10 }} onClick={() => go('sim')}>
                    模擬預覽
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="small">這不是改一個數字能解決的，照上面的檢查清單處理，再重錄一份日誌。</p>
          )}
        </div>
      )}

      {(applied || (showResult && !diag.primary)) && (
        <div className="panel" id="arm-tune-step-3">
          <h2>步驟 3：{diag.primary ? '上機驗證' : '達標，輸出參數'}</h2>
          {diag.primary ? (
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              <li>把上面建議改的那一個參數，改進機器人專案的程式碼（程式碼才是參數的最終依據）。</li>
              <li>照單元零的流程上機：先低速、有人顧 Disable，人不要站在手臂掃過的範圍。</li>
              <li>用同樣的動作（Arm.tuningRoutine）再錄一份日誌，回到這裡匯入，看問題有沒有消失。</li>
            </ol>
          ) : (
            <p className="small">把這組參數寫進程式碼並 commit。之後換負載或改手臂，再重新走一次循環。</p>
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
        {primary && <span className="chip" style={{ marginLeft: 8 }}>第一優先</span>}
      </b>
      <p className="small" style={{ margin: '4px 0' }}>
        {issue.summary}
      </p>
      <ul className="small" style={{ paddingLeft: 18, margin: '4px 0' }}>
        {issue.evidence.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {issue.change && <p className="small" style={{ margin: '4px 0' }}>建議：{describeChange(issue.change, 'arm')}</p>}
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
