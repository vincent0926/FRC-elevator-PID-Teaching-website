import { useState } from 'react'

/**
 * 檢核題。答錯給提示，最多三層，越後面越接近答案；答對才算完成關卡。
 */

export interface QuizDef {
  question: string
  options: string[]
  answer: number
  /** 答對後的解釋 */
  explain: string
  /** 三層提示：方向 → 關鍵公式 → 幾乎是答案 */
  hints: string[]
}

export function Quiz({ quiz, done, onCorrect }: { quiz: QuizDef; done?: boolean; onCorrect?: () => void }) {
  const [picked, setPicked] = useState<number | null>(done ? quiz.answer : null)
  const [wrong, setWrong] = useState(0)
  const correct = picked === quiz.answer

  const pick = (i: number) => {
    if (correct) return
    setPicked(i)
    if (i === quiz.answer) onCorrect?.()
    else setWrong((w) => w + 1)
  }

  return (
    <div className="quiz">
      <b className="small">檢核題</b>
      <p style={{ margin: '4px 0 0' }}>{quiz.question}</p>
      <ul>
        {quiz.options.map((o, i) => (
          <li key={i}>
            <button
              type="button"
              aria-pressed={picked === i}
              className={picked === i ? (i === quiz.answer ? 'right' : 'wrong') : undefined}
              onClick={() => pick(i)}
            >
              {o}
            </button>
          </li>
        ))}
      </ul>
      <div aria-live="polite">
        {correct && <div className="ok">答對了。{quiz.explain}</div>}
        {!correct && wrong > 0 && (
          <div className="note">
            提示 {Math.min(wrong, quiz.hints.length)}：{quiz.hints[Math.min(wrong, quiz.hints.length) - 1]}
          </div>
        )}
      </div>
    </div>
  )
}

/** 一組檢核題，全部答對才算完成（教學單元用） */
export function QuizSet({ quizzes, done, onDone }: { quizzes: QuizDef[]; done?: boolean; onDone?: () => void }) {
  const [right, setRight] = useState<boolean[]>(() => quizzes.map(() => !!done))
  const n = right.filter(Boolean).length
  return (
    <div>
      {quizzes.map((q, i) => (
        <Quiz
          key={q.question}
          quiz={q}
          done={done}
          onCorrect={() => {
            const next = [...right]
            next[i] = true
            setRight(next)
            if (next.every(Boolean)) onDone?.()
          }}
        />
      ))}
      {!done && quizzes.length > 1 && (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          已答對 {n} / {quizzes.length} 題，全部答對才算完成這個單元。
        </p>
      )}
    </div>
  )
}
