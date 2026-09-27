import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { applyChange, gainsOf, paramsFromGains } from '../../core/analysis/apply'
import type { CheckReport } from '../../core/analysis/checks'
import { describeChange, diagnose, estimateRobotGains, ISSUE_LABEL, ISSUE_ORDER, round3, type Issue, type IssueKey } from '../../core/analysis/diagnose'
import { segment } from '../../core/analysis/segment'
import { CONTROL_PERIOD, type ControllerLocation, type Slot0Gains } from '../../core/controller/slot0'
import type { AlignedLog } from '../../core/log/fieldMap'
import type { ParameterSet } from '../../schema/parameterSet'
import { ExportPanel } from '../calculate/ExportPanel'
import { LESSONS } from '../calculate/lessons'

/**
 * 步驟 1–3：找問題 → 處理一個 → 上機驗證。
 * 引導模式：先讓隊員自己選問題、寫理由，答錯給三層提示；專家模式（教學關卡全部完成才開放）直接看結果。
 */

type GainsSource = 'log' | 'tuning' | 'custom' | 'theory'
type Guess = IssueKey | 'none'

const SOURCE_LABEL: Record<GainsSource, string> = {
  log: '從日誌推算',
  tuning: '上次的調參建議值',
  custom: '自訂參數組',
  theory: '理論值',
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
}

export function DiagnosisPanel({ log, report, logName, onHighlight }: DiagnosisPanelProps) {
  const { mechanism, theory, custom, tuning, setTuning, rounds, addRound, clearRounds, lessonsDone, setSimSource, go } = useStore()
  const expertUnlocked = LESSONS.every((l) => lessonsDone[l.id])
  const [expert, setExpert] = useState(false)
  const [location, setLocation] = useState<ControllerLocation>('talonfx')

  // ---------- 機器人上當時的參數 ----------
  // 匯入時的快照：套用建議會改掉 tuning，不能讓它回頭改變這份日誌的分析（換日誌時父層用 key 重新掛載）
  const [sets] = useState<Record<Exclude<GainsSource, 'log'>, ParameterSet | null>>(() => ({ tuning, custom, theory }))
  const seg = useMemo(() => segment(log), [log])
  const [source, setSource] = useState<GainsSource>(() => (log.cols.feedforwardOutput && log.cols.closedLoopOutput ? 'log' : sets.tuning ? 'tuning' : 'theory'))
  // 推不準的欄位用哪一組補：有調參建議值就用它（多半是上一輪放上機器人的），否則理論值
  const fallbackSet = sets.tuning ?? sets.custom ?? sets.theory!
  const estimate = useMemo(() => estimateRobotGains(log, gainsOf(fallbackSet), seg), [log, seg, fallbackSet])
  const effectiveSource: GainsSource = source === 'log' && !estimate ? 'theory' : source !== 'log' && !sets[source] ? 'theory' : source
  const base: ParameterSet = useMemo(() => {
    if (effectiveSource === 'log' && estimate) {
      // Motion Magic 也從日誌看：參考速度、加速度的量級
      return paramsFromGains(mechanism, estimate.gains, { cruiseVelocity: round3(seg.vScale), acceleration: round3(seg.aScale) || fallbackSet.motionMagic.acceleration }, 'measured', `從 ${logName} 推算`)
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
    const note = `${ISSUE_LABEL[issue.key]}：${describeChange(issue.change)}`
    setTuning(applyChange(base, issue.change, note))
    addRound({ at: new Date().toISOString(), logName, issue: ISSUE_LABEL[issue.key], change: describeChange(issue.change) })
    setApplied(true)
  }

  const guessedReal = guess && guess !== 'none' && diag.issues.some((i) => i.key === guess)

  return (
    <>
      <div className="panel">
        <h2>機器人上當時的參數</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          建議是「在這組參數上改一個」，所以要先知道錄日誌時機器人跑的是哪一組。
        </p>
        <div className="row">
          <div className="seg" role="group" aria-label="參數來源">
            {(['log', 'tuning', 'custom', 'theory'] as GainsSource[]).map((s) => (
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
                  {effectiveSource === 'log' && estimate?.fromFallback.includes(k) && '・日誌推不準，沿用' + (sets.tuning ? '調參建議值' : sets.custom ? '自訂' : '理論值')}
                </td>
              </tr>
            ))}
            <tr>
              <th>Motion Magic</th>
              <td className="num">
                {base.motionMagic.cruiseVelocity.toFixed(2)} / {base.motionMagic.acceleration.toFixed(1)}
              </td>
              <td className="small muted">m/s、m/s²</td>
            </tr>
          </tbody>
        </table>
        {effectiveSource === 'log' && <p className="small muted">由日誌的前饋欄位與回授欄位反推。跟你記得的不一樣時，以程式碼裡的為準，改選其他來源。</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <span className="small">閉迴路在哪裡跑：</span>
          <div className="seg" role="group" aria-label="閉迴路位置">
            <button type="button" aria-pressed={location === 'talonfx'} onClick={() => changeLocation('talonfx')}>
              TalonFX（1 kHz）
            </button>
            <button type="button" aria-pressed={location === 'roborio'} onClick={() => changeLocation('roborio')}>
              roboRIO（50 Hz）
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>步驟 1：找出問題</h2>
          <label className="check" title={expertUnlocked ? '' : '1F 的教學關卡全部完成才開放'}>
            <input type="checkbox" checked={expert} disabled={!expertUnlocked} onChange={(e) => setExpert(e.target.checked)} />
            專家模式{!expertUnlocked && '（完成 1F 教學關卡後開放）'}
          </label>
        </div>

        {!expert && !solved && (
          <>
            <p className="small">
              先自己看圖。照順序檢查：<b>物理限制 → 振盪 → 機構問題 → kG → kS → kV → kA → kP → kD</b>。前面的問題沒解決，後面的判斷都不準。
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
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：靜止時紅線一直在 0 上面" />
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
                        ? '回授輸出（紅線）是不是一直在 0 附近？位置有沒有緊跟目標？'
                        : '照順序表從最前面一項一項排除，不要跳著看。')}
                  {wrong === 2 && (diag.primary ? `${diag.primary.lookAt}（圖上黃色是要看的地方）` : '看電壓圖的紅線和位置圖：都很乾淨的話，就是沒有問題。')}
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
            {diag.primary ? <IssueCard issue={diag.primary} primary /> : <div className="ok">前饋和 PID 都沒有明顯問題：回授輸出很小，到位時間與超越量都在容許範圍內。</div>}
            {expert && diag.issues.length > 1 && (
              <details style={{ marginTop: 10 }}>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  其他也偵測到的問題（先處理上面那個，這些改完重錄再看）
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
        <div className="panel">
          <h2>步驟 2：處理這一個問題</h2>
          {diag.primary.change ? (
            <>
              <p className="small">
                只改這一個，其他參數不要動：<b>{describeChange(diag.primary.change)}</b>
              </p>
              {!applied ? (
                <button type="button" className="btn primary" onClick={() => apply(diag.primary!)}>
                  套用成調參建議值
                </button>
              ) : (
                <>
                  <div className="ok">已存成「調參建議值」。先到模擬看看改完的樣子，再上機。</div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        setSimSource('tuning')
                        go('sim')
                      }}
                    >
                      模擬預覽
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="small">這不是改參數能解決的，照上面的檢查清單處理機構，再重錄一份日誌。</p>
          )}
        </div>
      )}

      {(applied || (showResult && !diag.primary)) && (
        <div className="panel">
          <h2>步驟 3：{diag.primary ? '上機驗證' : '達標，輸出參數'}</h2>
          {diag.primary ? (
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              <li>下載 Java 或 JSON，放進機器人專案（程式碼才是參數的最終依據）。</li>
              <li>照單元零的流程上機：先低速、有人顧 Disable。</li>
              <li>用同樣的動作再錄一份日誌，回到這裡匯入，看問題有沒有消失。</li>
            </ol>
          ) : (
            <p className="small">把這組參數寫進程式碼並 commit。之後換機構或加重量，再重新走一次循環。</p>
          )}
          <div style={{ marginTop: 12 }}>
            <ExportPanel ps={diag.primary ? (tuning ?? base) : { ...base, source: 'tuning' }} />
          </div>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>調參歷程</h2>
            <button type="button" className="linkbtn small" onClick={clearRounds}>
              清除
            </button>
          </div>
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>日誌</th>
                <th>問題</th>
                <th>改了什麼</th>
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
            同一個問題連續出現三次以上還沒改善，多半是機構或資料有問題，不要一直往同一個方向加。
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
      {issue.change && <p className="small" style={{ margin: '4px 0' }}>建議：{describeChange(issue.change)}</p>}
      {issue.checklist && (
        <>
          <p className="small" style={{ margin: '6px 0 2px' }}>
            檢查清單：
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
