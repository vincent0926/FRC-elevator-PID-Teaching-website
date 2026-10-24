import { useState } from 'react'
import type { ParameterSet } from '../../schema/parameterSet'
import { CHALLENGE_ATTEMPTS, LEVEL_LABEL, type ChallengeLevel, type ChallengeStatus, type HiddenPlant } from '../../core/challenge'
import { t } from '../../core/lang'

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
      <details className="panel scen">
        <summary>
          <b>{t('挑戰模式', 'Challenge mode')}</b>
          <span className="small muted">{t('系統隨機產生一台看不到參數的電梯，你要在有限次數內把它調到達標。', 'The system makes a random elevator whose parameters you can’t see, and you have to tune it to pass within a limited number of tries.')}</span>
        </summary>
        <div className="seg" role="group" aria-label={t('難度', 'Difficulty')} style={{ marginTop: 12 }}>
          {(['easy', 'hard'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>
              {l === 'easy' ? t(`入門（${CHALLENGE_ATTEMPTS.easy} 次）`, `Beginner (${CHALLENGE_ATTEMPTS.easy} tries)`) : t(`進階（${CHALLENGE_ATTEMPTS.hard} 次）`, `Advanced (${CHALLENGE_ATTEMPTS.hard} tries)`)}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ margin: '8px 0' }}>
          {t(
            <>
            {LEVEL_LABEL[level]}。一開始先用理論值跑一次（不算次數），看圖判斷哪裡不對，改「自訂」參數後按「送出」。會換掉目前的「自訂」參數。
            </>,
            <>
              {LEVEL_LABEL[level]}. First run once with the theory values (doesn’t count), judge what’s wrong from the charts, change the “Custom” gains, then press “Submit”. This replaces your current “Custom” gains.
            </>,
          )}
        </p>
        <button className="btn primary small" type="button" onClick={() => onStart(level)}>
          {t('開始挑戰', 'Start challenge')}
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
          {t('挑戰模式・', 'Challenge · ')}
          {state.level === 'easy' ? t('入門', 'Beginner') : t('進階', 'Advanced')}
          {state.status === 'playing' && t(`：還剩 ${left} 次`, `: ${left} tries left`)}
          {state.status === 'won' && t(`：成功！用了 ${state.attempts} 次`, `: success! Took ${state.attempts} tries`)}
          {state.status === 'lost' && t('：次數用完了', ': out of tries')}
        </b>
        <div className="row">
          {state.status === 'playing' && (
            <button className="btn primary small" type="button" onClick={onSubmit}>
              {t(`送出目前的自訂參數（第 ${state.attempts + 1} 次）`, `Submit current custom gains (try ${state.attempts + 1})`)}
            </button>
          )}
          {state.status !== 'playing' && (
            <button className="btn small" type="button" onClick={() => onStart(state.level)}>
              {t('再挑戰一台', 'Try another one')}
            </button>
          )}
          <button className="btn small" type="button" onClick={onQuit}>
            {t('結束挑戰', 'End challenge')}
          </button>
        </div>
      </div>
      {state.status === 'playing' ? (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          {t(
            <>
            受控體藏起來了。從圖找線索：停住時停在哪（kG）、往上往下差多少（kS）、等速段落後多少（kV）、加減速時差多少（kA）。改完「自訂」參數再送出，指標全部變綠就贏了。
            </>,
            <>
              The plant is hidden. Look for clues in the charts: where it stops (kG), how different up and down are (kS), how much it lags in the cruise section (kV), how far off it is while accelerating (kA). Change the “Custom” gains and submit; when every metric turns green, you win.
            </>,
          )}
        </p>
      ) : (
        <div className="small" style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 6px' }}>
            {t(
              `這台電梯其實是：重量 ${pct(h.kGScale)}、kV ${pct(h.kVScale)}、慣性 ${pct(h.kAScale)}、摩擦往上 ${h.frictionUp.toFixed(2)} V、往下 ${h.frictionDown.toFixed(2)} V。`,
              `This elevator was actually: weight ${pct(h.kGScale)}, kV ${pct(h.kVScale)}, inertia ${pct(h.kAScale)}, friction ${h.frictionUp.toFixed(2)} V up, ${h.frictionDown.toFixed(2)} V down.`,
            )}
          </p>
          {solution && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ margin: '6px 0' }}>
                  <thead>
                    <tr>
                      <th>{t('參數', 'Gain')}</th>
                      <th className="num">{t('你最後送出的', 'Your last submission')}</th>
                      <th className="num">{t('參考解答', 'Reference solution')}</th>
                      <th>{t('為什麼是這個數', 'Why this number')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>kS</td>
                      <td className="num">{submitted ? submitted.feedforward.kS.toFixed(2) : '—'}</td>
                      <td className="num">{solution.kS.toFixed(2)}</td>
                      <td>{t('往上、往下摩擦的平均', 'Average of the up and down friction')}</td>
                    </tr>
                    <tr>
                      <td>kG</td>
                      <td className="num">{submitted ? submitted.feedforward.kG.toFixed(3) : '—'}</td>
                      <td className="num">{solution.kG.toFixed(3)}</td>
                      <td>{t('理論 × 重量倍率，再加（往上摩擦 − 往下摩擦）÷ 2：摩擦不對稱等於 kG 偏移', 'Theory × weight ratio, plus (friction up − friction down) ÷ 2: asymmetric friction is the same as a kG offset')}</td>
                    </tr>
                    <tr>
                      <td>kV</td>
                      <td className="num">{submitted ? submitted.feedforward.kV.toFixed(3) : '—'}</td>
                      <td className="num">{solution.kV.toFixed(3)}</td>
                      <td>{t('理論 × kV 倍率（看等速段落後多少）', 'Theory × kV ratio (from how much it lags in the cruise section)')}</td>
                    </tr>
                    <tr>
                      <td>kA</td>
                      <td className="num">{submitted ? submitted.feedforward.kA.toFixed(4) : '—'}</td>
                      <td className="num">{solution.kA.toFixed(4)}</td>
                      <td>{t('理論 × 慣性倍率（看加減速時差多少）', 'Theory × inertia ratio (from how far off it is while accelerating)')}</td>
                    </tr>
                    <tr>
                      <td>kP</td>
                      <td className="num">{submitted ? submitted.feedback.kP.toFixed(0) : '—'}</td>
                      <td className="num">{solution.kP.toFixed(0)}</td>
                      <td>{t('前饋準了，kP 只要修剩下的一點誤差', 'With accurate feedforward, kP only has to fix the little error that’s left')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ margin: '0 0 6px' }}>
                {t(
                  <>
                  Motion Magic 放慢到 60%：重的電梯用理論速度會頂到電壓上限，這時調 PID 沒用，要先放慢。
                  </>,
                  <>
                    Motion Magic slowed to 60%: a heavy elevator at the theory speed hits the voltage limit, and tuning PID won’t help then; slow it down first.
                  </>,
                )}
              </p>
              {onTrySolution && (
                <button className="btn small" type="button" onClick={onTrySolution}>
                  {t('用參考解答在這台電梯跑一次（不算次數）', 'Run the reference solution on this elevator (doesn’t count)')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
