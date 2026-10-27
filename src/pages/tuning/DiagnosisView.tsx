import { useMemo, useState, type ReactNode } from 'react'
import { describeChange, diagnose, estimateRobotGains, ISSUE_LABEL, ISSUE_ORDER, round3, type Issue, type IssueKey, type ParamChange } from '../../core/analysis/diagnose'
import { segment } from '../../core/analysis/segment'
import { CONTROL_PERIOD, type ControllerLocation, type Slot0Gains } from '../../core/controller/slot0'
import type { LogMechanism } from '../../core/log/fieldMap'
import type { MechanismStore } from '../../app/mechanismStore'
import { fixed } from '../../core/format'
import type { DiagnosisProps } from './TuningWorkspace'
import { t } from '../../core/lang'

/**
 * 步驟 1–3：找問題 → 處理一個 → 上機驗證（電梯、手臂共用，機構不同的地方由 config 給）。
 * 引導模式：先讓隊員自己選問題、寫理由，答錯給三層提示；專家模式（教學關卡全部完成才開放）直接看結果。
 */

type Guess = IssueKey | 'none'
type MotionMagic = { cruiseVelocity: number; acceleration: number }

/** 可以選的參數組（log、sim 以外），照「日誌推不準時拿來補」的優先順序排，理論值放最後 */
export interface GainSet<P> {
  key: string
  label: string
  /** 「日誌推不準，沿用…」用的短名稱 */
  short: string
  params: P | null
}

export interface DiagnosisConfig<P extends { motionMagic: MotionMagic }> {
  kind: LogMechanism
  /** 步驟面板 id 的前綴（電梯 tune、手臂 arm-tune，StepBar 用） */
  idPrefix: string
  sets: GainSet<P>[]
  gainsOf: (p: P) => Slot0Gains
  /** 日誌推回來的參數 → 參數組（source = measured） */
  fromGains: (g: Slot0Gains, mm: MotionMagic, note: string) => P
  /** 換成目前的機構資料（參數組裡存的可能是舊的） */
  withMechanism: (p: P) => P
  gainRows: [keyof Slot0Gains, string, number][]
  motionMagicText: (mm: MotionMagic) => string
  motionMagicUnit: string
  statorCurrentLimit: number
  expertUnlocked: boolean
  store: Pick<MechanismStore<P, unknown>, 'rounds' | 'addRound' | 'clearRounds'>
  /** 套用一個建議（存成調參建議值或自訂） */
  onApply: (base: P, change: ParamChange, note: string) => void
  onPreview: () => void
  text: {
    /** 「要先知道錄日誌時 ___ 跑的是哪一組」 */
    intro: ReactNode
    expertLock: string
    expertLockNote: string
    order: ReactNode
    placeholder: string
    hintNone: string
    hintLookNone: string
    applyLabel: string
    applied: string
    noChange: string
    verify: ReactNode
    passed: string
  }
}

export function DiagnosisView<P extends { motionMagic: MotionMagic }>({ log, report, logName, onHighlight, sim, config }: DiagnosisProps<P> & { config: DiagnosisConfig<P> }) {
  const { kind, gainsOf, text } = config
  const { rounds, addRound, clearRounds } = config.store
  const [expert, setExpert] = useState(false)
  const [location, setLocation] = useState<ControllerLocation>(sim?.location ?? 'talonfx')

  // ---------- 機器人上當時的參數 ----------
  // 匯入時的快照：套用建議會改掉參數組，不能讓它回頭改變這份日誌的分析（換日誌時父層用 key 重新掛載）
  const [sets] = useState(() => [...(sim ? [{ key: 'sim', label: t('3F 模擬用的', 'Used in the 3F sim'), short: t('3F 模擬', '3F sim'), params: sim.params }] : []), ...config.sets])
  const byKey = (k: string) => sets.find((s) => s.key === k)?.params ?? null
  const theory = byKey('theory')!
  const seg = useMemo(() => segment(log), [log])
  // 推不準的欄位用哪一組補：有調參建議值、自訂就用它（多半是上一輪放上機器人的），否則理論值
  const [fallback] = useState(() => config.sets.find((s) => s.params) ?? config.sets[config.sets.length - 1])
  const fallbackSet = fallback.params ?? theory
  const estimate = useMemo(() => estimateRobotGains(log, gainsOf(fallbackSet), seg, kind), [log, seg, fallbackSet, gainsOf, kind])
  const [source, setSource] = useState<string>(() => (sim ? 'sim' : estimate ? 'log' : fallback.key))
  const effectiveSource = source === 'log' ? (estimate ? 'log' : 'theory') : byKey(source) ? source : 'theory'
  const base: P = useMemo(() => {
    if (effectiveSource === 'log' && estimate) {
      // Motion Magic 也從日誌看：參考速度、加速度的量級
      return config.fromGains(estimate.gains, { cruiseVelocity: round3(seg.vScale), acceleration: round3(seg.aScale) || fallbackSet.motionMagic.acceleration }, t(`從 ${logName} 推算`, `Estimated from ${logName}`))
    }
    return config.withMechanism(byKey(effectiveSource) ?? theory)
    // config 每次 render 都是新的物件；fromGains、withMechanism 只跟著機構資料變
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSource, estimate, seg, logName, fallbackSet, sets, config.withMechanism])
  const gains = gainsOf(base)

  const diag = useMemo(
    () => diagnose(log, report, gainsOf(base), base.motionMagic, { mechanism: kind, statorCurrentLimit: config.statorCurrentLimit, controlPeriod: CONTROL_PERIOD[location] }),
    [log, report, base, location, config.statorCurrentLimit, gainsOf, kind],
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
  const changeSource = (s: string) => {
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
    config.onApply(base, issue.change, `${ISSUE_LABEL[issue.key]}${t('：', ': ')}${describeChange(issue.change, kind)}`)
    addRound({ at: new Date().toISOString(), logName, issue: ISSUE_LABEL[issue.key], change: describeChange(issue.change, kind) })
    setApplied(true)
  }

  const guessedReal = guess && guess !== 'none' && diag.issues.some((i) => i.key === guess)
  const sourceKeys = [...(sim ? ['sim'] : []), 'log', ...config.sets.map((s) => s.key)]
  const labelOf = (k: string) => (k === 'log' ? t('從日誌推算', 'Estimated from the log') : sets.find((s) => s.key === k)!.label)

  return (
    <>
      <div className="panel">
        <h2>{t('機器人上當時的參數', 'Gains on the robot at the time')}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          {text.intro}
        </p>
        <div className="row">
          <div className="seg" role="group" aria-label={t('參數來源', 'Gain source')}>
            {sourceKeys.map((s) => (
              <button key={s} type="button" aria-pressed={effectiveSource === s} disabled={s === 'log' ? !estimate : !byKey(s)} onClick={() => changeSource(s)}>
                {labelOf(s)}
              </button>
            ))}
          </div>
        </div>
        <table className="tbl" style={{ marginTop: 10 }}>
          <tbody>
            {config.gainRows.map(([k, unit, d]) => (
              <tr key={k}>
                <th>{k}</th>
                <td className="num">{fixed(gains[k], d)}</td>
                <td className="small muted">
                  {unit}
                  {effectiveSource === 'log' && estimate?.fromFallback.includes(k) && t('・日誌推不準，沿用', '・can’t estimate from the log, using ') + fallback.short}
                </td>
              </tr>
            ))}
            <tr>
              <th>Motion Magic</th>
              <td className="num">{config.motionMagicText(base.motionMagic)}</td>
              <td className="small muted">{config.motionMagicUnit}</td>
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

      <div className="panel" id={`${config.idPrefix}-step-1`}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{t('步驟 1：找出問題', 'Step 1: find the problem')}</h2>
          <label className="check" title={config.expertUnlocked ? '' : text.expertLock}>
            <input type="checkbox" checked={expert} disabled={!config.expertUnlocked} onChange={(e) => setExpert(e.target.checked)} />
            {t('專家模式', 'Expert mode')}
            {!config.expertUnlocked && text.expertLockNote}
          </label>
        </div>

        {!expert && !solved && (
          <>
            <p className="small">{text.order}</p>
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
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={text.placeholder} />
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
                        ? text.hintNone
                        : t('照順序表從最前面一項一項排除，不要跳著看。', 'Go through the order list from the top, ruling things out one by one; don’t skip around.'))}
                  {wrong === 2 && (diag.primary ? t(`${diag.primary.lookAt}（圖上黃色是要看的地方）`, `${diag.primary.lookAt} (yellow on the chart is where to look)`) : text.hintLookNone)}
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
            {diag.primary ? <IssueCard issue={diag.primary} kind={kind} primary /> : <div className="ok">{t('前饋和 PID 都沒有明顯問題：回授輸出很小，到位時間與超越量都在容許範圍內。', 'No obvious feedforward or PID problem: feedback output is small, and settling time and overshoot are within limits.')}</div>}
            {expert && diag.issues.length > 1 && (
              <details style={{ marginTop: 10 }}>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  {t('其他也偵測到的問題（先處理上面那個，這些改完重錄再看）', 'Other problems also detected (fix the one above first, then re-record and check these)')}
                </summary>
                {diag.issues.slice(1).map((i) => (
                  <IssueCard key={i.key + i.summary} issue={i} kind={kind} />
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
        <div className="panel" id={`${config.idPrefix}-step-2`}>
          <h2>{t('步驟 2：處理這一個問題', 'Step 2: fix this one problem')}</h2>
          {diag.primary.change ? (
            <>
              <p className="small">
                {t(
                  <>
                  只改這一個，其他參數不要動：<b>{describeChange(diag.primary.change, kind)}</b>
                  </>,
                  <>
                    Change only this one and leave the other gains alone: <b>{describeChange(diag.primary.change, kind)}</b>
                  </>,
                )}
              </p>
              {!applied ? (
                <button type="button" className="btn primary" onClick={() => apply(diag.primary!)}>
                  {text.applyLabel}
                </button>
              ) : (
                <>
                  <div className="ok">{text.applied}</div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button type="button" className="btn primary" onClick={config.onPreview}>
                      {t('模擬預覽', 'Preview in sim')}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="small">{text.noChange}</p>
          )}
        </div>
      )}

      {(applied || (showResult && !diag.primary)) && (
        <div className="panel" id={`${config.idPrefix}-step-3`}>
          <h2>{t(`步驟 3：${diag.primary ? '上機驗證' : '達標，輸出參數'}`, `Step 3: ${diag.primary ? 'verify on the robot' : 'passed, export the gains'}`)}</h2>
          {diag.primary ? (
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              {text.verify}
            </ol>
          ) : (
            <p className="small">{text.passed}</p>
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
            {t('同一個問題連續出現三次以上還沒改善，多半是機構或資料有問題，不要一直往同一個方向加。', 'If the same problem shows up three or more times in a row without improving, it’s most likely the mechanism or the data; don’t keep pushing in the same direction.')}
          </p>
        </div>
      )}
    </>
  )
}

function IssueCard({ issue, kind, primary }: { issue: Issue; kind: LogMechanism; primary?: boolean }) {
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
      {issue.change && <p className="small" style={{ margin: '4px 0' }}>{t('建議：', 'Suggestion: ')}{describeChange(issue.change, kind)}</p>}
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
