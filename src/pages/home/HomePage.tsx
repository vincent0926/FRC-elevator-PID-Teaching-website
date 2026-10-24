import { UNIT0_ITEMS, useStore, type PageId } from '../../app/store'
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
  const { go, lessonsDone, unit0 } = useStore()
  const lessonCount = LESSONS.filter((l) => lessonsDone[l.id]).length
  const unit0Count = unit0.filter(Boolean).length

  return (
    <section aria-labelledby="t-home">
      <div className="head">
        <div>
          <h1 id="t-home">{t('把電梯調好，而不是抄數字', 'Tune your elevator, don’t just copy numbers')}</h1>
          <p className="lead">
            {t(
              <>
              從機構資料推出理論值，在模擬裡先跑一次，上機錄日誌，再讓網站告訴你問題出在哪。一次改一個參數，直到每個指標都達標。
              </>,
              <>
                Derive theory values from your mechanism data, try them in the sim first, record a log on the robot, then let the site tell you where the problem is. Change one gain at a time until every metric passes.
              </>,
            )}
          </p>
        </div>
      </div>

      <QuickStart what={t('電梯', 'elevator')} />

      <button className="path-card guide-card" type="button" onClick={() => go('guide')}>
        <h2>{t('第一次來？先看使用說明', 'First time here? Read the guide')}</h2>
        <p>{t('怎麼從機構資料走到看懂調參建議、每一層怎麼操作、卡住了怎麼辦。大約 30 分鐘走一遍。', 'How to go from mechanism data to understanding the tuning advice, how each floor works, and what to do when you’re stuck. About 30 minutes end to end.')}</p>
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
          <p>{t('從五個教學關卡開始，一步一步推出 kG、kV、kA 和 PID 起始值，再到模擬裡試跑。', 'Start with the five lessons, working out kG, kV, kA and starting PID values step by step, then try them in the sim.')}</p>
          <p className="small muted" style={{ marginTop: 10 }}>
            {t(`教學關卡 ${lessonCount} / ${LESSONS.length}`, `Lessons ${lessonCount} / ${LESSONS.length}`)}
          </p>
        </button>
        <button className="path-card" type="button" onClick={() => go('tune')}>
          <h2>{t('已經有日誌了', 'Already have a log')}</h2>
          <p>{t('直接匯入 AdvantageKit 的 .wpilog，對應欄位、做資料檢查，看位置、電壓、電流有沒有異常。', 'Import an AdvantageKit .wpilog directly, map the fields, run the data checks, and see whether position, voltage and current look wrong.')}</p>
          <p className="small muted" style={{ marginTop: 10 }}>
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
