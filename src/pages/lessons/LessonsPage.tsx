import { useMemo, type ReactNode } from 'react'
import { useStore } from '../../app/store'
import { LessonList } from '../../components/LessonList'
import { LESSONS } from '../calculate/lessons'
import { ARM_LESSONS } from '../arm/armLessons'
import { useArm } from '../arm/armStore'
import { FLYWHEEL_LESSONS } from '../flywheel/flywheelLessons'
import { useFlywheelMechanism, useShotPlan } from '../flywheel/flywheelStore'
import { computeFlywheelFeedforward } from '../../core/flywheel/flywheel'
import { HelpLink } from '../../components/HelpLink'
import { GUIDE_ANCHOR } from '../guide/guideContent'
import { t } from '../../core/lang'

/**
 * 教學關卡：從 1F 拆出來的獨立頁面。題目用固定的練習機構出（決策 52），
 * 答對後的「你的機構」數字讀 1F 填的機構資料，所以兩頁共用同一份資料。
 */

/** help：射球飛輪沒有使用說明，不放「怎麼用這一頁？」 */
function Frame({ id, title, lead, count, total, help = true, children }: { id: string; title: string; lead: string; count: number; total: number; help?: boolean; children: ReactNode }) {
  const { go } = useStore()
  return (
    <section aria-labelledby={id}>
      <div className="head">
        <div>
          <h1 id={id}>{title}</h1>
          <p className="lead">
            {lead}{' '}
            <button className="linkbtn" type="button" onClick={() => go('calc')}>
              {t('到 1F 改機構資料', 'Edit the mechanism data in 1F')}
            </button>
            {help && (
              <>
                {' '}
                <HelpLink section={GUIDE_ANCHOR.lessons} />
              </>
            )}
          </p>
        </div>
        <span className="phase">{t(`完成 ${count} / ${total}`, `Done ${count} / ${total}`)}</span>
      </div>
      <div className="panel">{children}</div>
    </section>
  )
}

const count = (ids: { id: string }[], done: Record<string, boolean>) => ids.filter((l) => done[l.id]).length

export function ElevatorLessonsPage() {
  const { mechanism, ff, theory, lessonsDone, markLesson } = useStore()
  return (
    <Frame
      id="t-lessons"
      title={t('教學關卡', 'Lessons')}
      lead={t('五個關卡一步一步推出 kG、kV、kA 和 PID 起始值。每關有學習目標、填空練習和檢核題，答對後會用你在 1F 填的電梯算一次。', 'Five lessons work out kG, kV, kA and starting PID values step by step. Each has a goal, fill-in exercises and a quiz; once you answer correctly it redoes the numbers with the elevator you entered in 1F.')}
      count={count(LESSONS, lessonsDone)}
      total={LESSONS.length}
    >
      <LessonList lessons={LESSONS} done={lessonsDone} onDone={markLesson} body={(l) => <l.Body m={mechanism} ff={ff} kP={theory.feedback.kP} done={lessonsDone[l.id]} />} />
    </Frame>
  )
}

export function ArmLessonsPage() {
  const { lessonsDone, markLesson } = useStore()
  const { arm, ff, theory } = useArm()
  return (
    <Frame
      id="t-arm-lessons"
      title={t('手臂・教學關卡', 'Arm · Lessons')}
      lead={t('五個關卡一步一步看手臂的參數怎麼來，弄懂 kG 為什麼要乘 cos θ。答對後會用你在 1F 填的手臂算一次。', 'Five lessons show step by step where the arm’s gains come from, including why kG is multiplied by cos θ. Once you answer correctly it redoes the numbers with the arm you entered in 1F.')}
      count={count(ARM_LESSONS, lessonsDone)}
      total={ARM_LESSONS.length}
    >
      <LessonList lessons={ARM_LESSONS} done={lessonsDone} onDone={markLesson} body={(l) => <l.Body m={arm} ff={ff} kP={theory.feedback.kP} done={lessonsDone[l.id]} />} />
    </Frame>
  )
}

export function FlywheelLessonsPage() {
  const { lessonsDone, markLesson } = useStore()
  const [mech] = useFlywheelMechanism()
  const [plan] = useShotPlan()
  const ff = useMemo(() => computeFlywheelFeedforward(mech), [mech])
  return (
    <Frame
      id="t-fw-lessons"
      title={t('射球飛輪・教學關卡', 'Flywheel shooter · Lessons')}
      lead={t('三個關卡：kV、轉動慣量（射一發掉多少）、轉速 → 球速 → 落點。每關用你在 1F 填的飛輪和射球資料算。', 'Three lessons: kV, moment of inertia (how much one shot costs), and wheel speed → ball speed → landing point. Each uses the flywheel and shot data you entered in 1F.')}
      count={count(FLYWHEEL_LESSONS, lessonsDone)}
      total={FLYWHEEL_LESSONS.length}
      help={false}
    >
      <LessonList lessons={FLYWHEEL_LESSONS} done={lessonsDone} onDone={markLesson} body={(l) => <l.Body m={mech} ff={ff} plan={plan} />} />
    </Frame>
  )
}
