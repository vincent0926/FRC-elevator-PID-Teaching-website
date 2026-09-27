import { useState } from 'react'
import type { ParameterSet } from '../../schema/parameterSet'
import { CHALLENGE_ATTEMPTS, LEVEL_LABEL, type ChallengeLevel, type ChallengeStatus, type HiddenPlant } from '../../core/challenge'

/**
 * 挑戰模式（3F 步驟 8）的控制列。受控體藏起來，只能從圖判斷；每按一次「送出」算一次。
 */

export interface ChallengeState {
  level: ChallengeLevel
  hidden: HiddenPlant
  max: number
  attempts: number
  status: ChallengeStatus
}

const pct = (x: number) => `${x >= 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`

export function ChallengePanel({
  state,
  onStart,
  onSubmit,
  onQuit,
  solution,
  submitted,
  onTrySolution,
}: {
  state: ChallengeState | null
  onStart: (level: ChallengeLevel) => void
  onSubmit: () => void
  onQuit: () => void
  /** 參考解答（結束後顯示） */
  solution: { kS: number; kG: number; kV: number; kA: number; kP: number } | null
  /** 最後一次送出的參數（結束後跟參考解答比） */
  submitted?: ParameterSet | null
  onTrySolution?: () => void
}) {
  const [level, setLevel] = useState<ChallengeLevel>('easy')

  if (!state) {
    return (
      <details className="panel scen" style={{ marginBottom: 16 }}>
        <summary>
          <b>挑戰模式</b>
          <span className="small muted">系統隨機產生一台看不到參數的電梯，你要在有限次數內把它調到達標。</span>
        </summary>
        <div className="seg" role="group" aria-label="難度" style={{ marginTop: 12 }}>
          {(['easy', 'hard'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>
              {l === 'easy' ? `入門（${CHALLENGE_ATTEMPTS.easy} 次）` : `進階（${CHALLENGE_ATTEMPTS.hard} 次）`}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ margin: '8px 0' }}>
          {LEVEL_LABEL[level]}。一開始先用理論值跑一次（不算次數），看圖判斷哪裡不對，改「自訂」參數後按「送出」。會換掉目前的「自訂」參數。
        </p>
        <button className="btn primary small" type="button" onClick={() => onStart(level)}>
          開始挑戰
        </button>
      </details>
    )
  }

  const left = state.max - state.attempts
  const h = state.hidden
  return (
    <div className={'panel challenge ' + state.status} style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>
          挑戰模式・{state.level === 'easy' ? '入門' : '進階'}
          {state.status === 'playing' && `：還剩 ${left} 次`}
          {state.status === 'won' && `：成功！用了 ${state.attempts} 次`}
          {state.status === 'lost' && '：次數用完了'}
        </b>
        <div className="row">
          {state.status === 'playing' && (
            <button className="btn primary small" type="button" onClick={onSubmit}>
              送出目前的自訂參數（第 {state.attempts + 1} 次）
            </button>
          )}
          {state.status !== 'playing' && (
            <button className="btn small" type="button" onClick={() => onStart(state.level)}>
              再挑戰一台
            </button>
          )}
          <button className="btn small" type="button" onClick={onQuit}>
            結束挑戰
          </button>
        </div>
      </div>
      {state.status === 'playing' ? (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          受控體藏起來了。從圖找線索：停住時停在哪（kG）、往上往下差多少（kS）、等速段落後多少（kV）、加減速時差多少（kA）。改完「自訂」參數再送出，指標全部變綠就贏了。
        </p>
      ) : (
        <div className="small" style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 6px' }}>
            這台電梯其實是：重量 {pct(h.kGScale)}、kV {pct(h.kVScale)}、慣性 {pct(h.kAScale)}、摩擦往上 {h.frictionUp.toFixed(2)} V、往下 {h.frictionDown.toFixed(2)} V。
          </p>
          {solution && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ margin: '6px 0' }}>
                  <thead>
                    <tr>
                      <th>參數</th>
                      <th className="num">你最後送出的</th>
                      <th className="num">參考解答</th>
                      <th>為什麼是這個數</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>kS</td>
                      <td className="num">{submitted ? submitted.feedforward.kS.toFixed(2) : '—'}</td>
                      <td className="num">{solution.kS.toFixed(2)}</td>
                      <td>往上、往下摩擦的平均</td>
                    </tr>
                    <tr>
                      <td>kG</td>
                      <td className="num">{submitted ? submitted.feedforward.kG.toFixed(3) : '—'}</td>
                      <td className="num">{solution.kG.toFixed(3)}</td>
                      <td>理論 × 重量倍率，再加（往上摩擦 − 往下摩擦）÷ 2：摩擦不對稱等於 kG 偏移</td>
                    </tr>
                    <tr>
                      <td>kV</td>
                      <td className="num">{submitted ? submitted.feedforward.kV.toFixed(3) : '—'}</td>
                      <td className="num">{solution.kV.toFixed(3)}</td>
                      <td>理論 × kV 倍率（看等速段落後多少）</td>
                    </tr>
                    <tr>
                      <td>kA</td>
                      <td className="num">{submitted ? submitted.feedforward.kA.toFixed(4) : '—'}</td>
                      <td className="num">{solution.kA.toFixed(4)}</td>
                      <td>理論 × 慣性倍率（看加減速時差多少）</td>
                    </tr>
                    <tr>
                      <td>kP</td>
                      <td className="num">{submitted ? submitted.feedback.kP.toFixed(0) : '—'}</td>
                      <td className="num">{solution.kP.toFixed(0)}</td>
                      <td>前饋準了，kP 只要修剩下的一點誤差</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ margin: '0 0 6px' }}>
                Motion Magic 放慢到 60%：重的電梯用理論速度會頂到電壓上限，這時調 PID 沒用，要先放慢。
              </p>
              {onTrySolution && (
                <button className="btn small" type="button" onClick={onTrySolution}>
                  用參考解答在這台電梯跑一次（不算次數）
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
