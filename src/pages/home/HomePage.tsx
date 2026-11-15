import { useStore, type PageId } from '../../app/store'
import { UNIT0_ITEMS, useElevator } from '../../app/elevatorStore'
import { LESSONS } from '../calculate/lessons'
import { QuickStart } from '../../components/QuickStart'
import { t } from '../../core/lang'

const LOOP: { where: 'site' | 'robot'; tag: string; name: string; page?: PageId }[] = [
  { where: 'site', tag: '1F', name: t('算理論值', 'Theory values'), page: 'calc' },
  { where: 'site', tag: '3F', name: t('模擬', 'Simulate'), page: 'sim' },
  { where: 'robot', tag: '4F', name: t('上機前準備', 'Prep before the robot'), page: 'learn' },
  { where: 'robot', tag: t('機器人', 'Robot'), name: t('上機測試並錄日誌', 'Test on the robot and record a log') },
  { where: 'site', tag: '2F', name: t('看調參建議', 'Read tuning advice'), page: 'tune' },
  { where: 'site', tag: '3F', name: t('模擬預覽', 'Preview in sim'), page: 'sim' },
  { where: 'robot', tag: t('機器人', 'Robot'), name: t('上機驗證', 'Verify on the robot') },
  { where: 'site', tag: '1F', name: t('達標後把參數寫進程式碼', 'Once it passes, put the gains in code'), page: 'calc' },
]

export function HomePage() {
  const { go, lessonsDone } = useStore()
  const { unit0 } = useElevator()
  const lessonCount = LESSONS.filter((l) => lessonsDone[l.id]).length
  const unit0Count = unit0.filter(Boolean).length

  return (
    <section aria-labelledby="t-home">
      <div className="head">
        <div>
          <h1 id="t-home">{t('把電梯調好，而不是抄數字', 'Tune your elevator, don’t just copy numbers')}</h1>
          <p className="lead">{t('理論值 → 模擬 → 上機錄日誌 → 調參，一次改一個參數。', 'Theory → sim → log on the robot → tune, one gain at a time.')}</p>
        </div>
      </div>

      <QuickStart />

      <button className="path-card guide-card" type="button" onClick={() => go('guide')}>
        <h2>{t('第一次來？先看使用說明', 'First time here? Read the guide')}</h2>
      </button>

      <details className="unit">
      <summary>
        <h2 style={{ margin: 0 }}>{t('完整的調參循環（8 步）', 'The full tuning loop (8 steps)')}</h2>
      </summary>
      <div style={{ padding: '0 20px 18px' }}>
      <ol className="loop">
        {LOOP.map((s, i) => (
          <li key={i} className={s.where}>
            <small>
              {i + 1}{t('．', '. ')}{s.tag}
            </small>
            {s.page ? (
              <button type="button" className="linkbtn" style={{ color: 'inherit', textDecoration: 'none', textAlign: 'left' }} onClick={() => go(s.page!)}>
                {s.name}
              </button>
            ) : (
              s.name
            )}
          </li>
        ))}
      </ol>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--blue-soft)' }} />
          {t(
            <>
            在網站上做
            </>,
            <>
              On the site
            </>,
          )}
        </span>
        <span>
          <i style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }} />
          {t(
            <>
            在機器人上做
            </>,
            <>
              On the robot
            </>,
          )}
        </span>
      </div>
      </div>
      </details>

      <div className="paths">
        <button className="path-card" type="button" onClick={() => go('lessons')}>
          <h2>{t('第一次調電梯', 'Tuning an elevator for the first time')}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {t(`教學關卡 ${lessonCount} / ${LESSONS.length}`, `Lessons ${lessonCount} / ${LESSONS.length}`)}
          </p>
        </button>
        <button className="path-card" type="button" onClick={() => go('tune')}>
          <h2>{t('已經有日誌了', 'Already have a log')}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {t(`上機前準備（單元零）${unit0Count} / ${UNIT0_ITEMS}`, `Prep before the robot (unit 0) ${unit0Count} / ${UNIT0_ITEMS}`)}
          </p>
        </button>
      </div>

      <div className="panel" style={{ marginTop: 22 }}>
        <h2>{t('這個網站不會做的事', 'What this site won’t do')}</h2>
        <p className="small" style={{ margin: 0 }}>
          {t(
            <>
            網站<b>不連線機器人、不寫入馬達參數</b>。改參數與上機測試一律在機器人端操作，參數以隊上專案的程式碼為準。
            <b>網站不能當急停，急停一律用 Driver Station。</b>
            </>,
            <>
              The site <b>does not connect to the robot or write motor settings</b>. Change gains and run tests on the robot side; your team’s project code is the source of truth for gains.{' '}
              <b>The site is not an e-stop. Always use the Driver Station to stop.</b>
            </>,
          )}
        </p>
      </div>
    </section>
  )
}
