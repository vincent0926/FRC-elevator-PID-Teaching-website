import { useState, type ReactNode } from 'react'

/**
 * 填空練習：先自己算，答對（或放棄）才顯示後面的公式與解說。
 * 答錯時比對常見錯誤，告訴隊員錯在哪裡，而不是只說「錯了」。
 */

export interface ExerciseField {
  label: string
  answer: number
  unit: string
  /** 相對誤差容許（預設 2%） */
  tol?: number
  /** 常見錯誤：填了這個值時要說的話 */
  mistakes?: { value: number; msg: string }[]
}

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * tol)

export function Exercise({
  prompt,
  fields,
  solvedAlready,
  children,
}: {
  prompt: ReactNode
  fields: ExerciseField[]
  /** 關卡已完成時直接顯示答案 */
  solvedAlready?: boolean
  /** 答對或放棄後才顯示 */
  children: ReactNode
}) {
  const [values, setValues] = useState<string[]>(() => fields.map(() => ''))
  const [checked, setChecked] = useState<(boolean | null)[]>(() => fields.map(() => null))
  const [gaveUp, setGaveUp] = useState(false)
  const solved = checked.every((c) => c === true)
  const revealed = solvedAlready || solved || gaveUp

  const check = () =>
    setChecked(
      fields.map((f, i) => {
        const v = Number(values[i])
        return values[i].trim() !== '' && Number.isFinite(v) && close(v, f.answer, f.tol ?? 0.02)
      }),
    )

  const feedback = (i: number): string | null => {
    if (checked[i] !== false) return null
    const f = fields[i]
    const v = Number(values[i])
    if (values[i].trim() === '' || !Number.isFinite(v)) return '先填一個數字。'
    const m = f.mistakes?.find((x) => close(v, x.value, f.tol ?? 0.02))
    return m ? m.msg : '不對，再算一次。'
  }

  return (
    <div className="exercise">
      <b className="small">先自己算</b>
      <div style={{ margin: '4px 0 8px' }}>{prompt}</div>
      {solvedAlready && <div className="ok">已完成。答案：{fields.map((f) => `${f.label} = ${f.answer} ${f.unit}`).join('、')}。</div>}
      {!solvedAlready && (
        <>
          <div className="fields">
            {fields.map((f, i) => (
              <label key={f.label} className="f">
                {f.label}
                <span className={'inp' + (checked[i] === false ? ' bad' : '')}>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={values[i]}
                    disabled={revealed}
                    onChange={(e) => {
                      const next = [...values]
                      next[i] = e.target.value
                      setValues(next)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && check()}
                  />
                  <em>{f.unit}</em>
                </span>
                {checked[i] === true && <span className="small pass">✓ 對了</span>}
                {feedback(i) && <span className="small fail">{feedback(i)}</span>}
              </label>
            ))}
          </div>
          {!revealed && (
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn small primary" type="button" onClick={check}>
                檢查
              </button>
              <button className="linkbtn small" type="button" onClick={() => setGaveUp(true)}>
                算不出來，直接看答案
              </button>
            </div>
          )}
          {solved && <div className="ok">都對了。下面是公式和你自己機構的數字。</div>}
          {gaveUp && !solved && (
            <div className="note">答案：{fields.map((f) => `${f.label} = ${f.answer} ${f.unit}`).join('、')}。看完下面的說明，再回頭算一次。</div>
          )}
        </>
      )}
      {revealed && <div className="exercise-body">{children}</div>}
    </div>
  )
}
