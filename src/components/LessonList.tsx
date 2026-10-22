import { useState, type ReactNode } from 'react'
import { Quiz, type QuizDef } from './Quiz'
import { t } from '../core/lang'

/** 教學關卡清單：一次打開一關，預設打開第一個還沒完成的。電梯、手臂、射球飛輪共用 */

export interface LessonItem {
  id: string
  title: string
  sub: string
  goal: string
  quiz: QuizDef
}

export function LessonList<L extends LessonItem>({
  lessons,
  done,
  onDone,
  body,
}: {
  lessons: L[]
  done: Record<string, boolean>
  onDone: (id: string) => void
  body: (l: L) => ReactNode
}) {
  const [open, setOpen] = useState<string | null>(() => lessons.find((l) => !done[l.id])?.id ?? null)
  return (
    <ol className="lessons">
      {lessons.map((l) => {
        const isOpen = open === l.id
        return (
          <li key={l.id} className={'lesson' + (done[l.id] ? ' done' : '')}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.id)}>
              <span>
                {l.title}
                <small>{l.sub}</small>
              </span>
            </button>
            {isOpen && (
              <div className="body">
                <div className="goal">{t('學習目標：', 'Goal: ')}{l.goal}</div>
                {body(l)}
                <Quiz key={l.id} quiz={l.quiz} done={done[l.id]} onCorrect={() => onDone(l.id)} />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
