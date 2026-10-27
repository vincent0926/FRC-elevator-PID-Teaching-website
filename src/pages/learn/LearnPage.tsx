import { MeasureKsKg } from './MeasureKsKg'
import { Unit4 } from './Unit4'
import { useStore } from '../../app/store'
import { UNIT0_ITEMS, useElevator } from '../../app/elevatorStore'
import { Unit1 } from './Unit1'
import { Unit2 } from './Unit2'
import { Unit3 } from './Unit3'
import { HelpLink } from '../../components/HelpLink'
import { GUIDE_ANCHOR } from '../guide/guideContent'
import { t } from '../../core/lang'

/**
 * 4F 實機資料教學。單元零必修，全部勾完才開放單元一、二。
 * 網站本身不能當急停，急停一律用 Driver Station。
 */

const UNIT0: { title: string; items: string[] }[] = t(
  [
    {
      title: '開始前檢查',
      items: ['機器人架好（輪子離地或固定），電梯周圍淨空，手不要伸進行程範圍', '電池 12.5 V 以上', '一個人專門顧 Disable（Enter）和急停（空白鍵），不做其他事'],
    },
    {
      title: '確認方向和單位',
      items: ['用 5% 以下電壓、0.5 秒以內的短脈衝，確認正電壓是往上', '用捲尺量實際移動距離，跟程式讀到的位置比對（差很多就是齒比或半徑填錯）'],
    },
    {
      title: '歸零',
      items: ['有極限開關：先用手觸發，確認程式讀得到', '沒有極限開關：用低電流限制慢慢往下碰擋，電流升高時歸零'],
    },
    {
      title: '設限制',
      items: ['軟體上下限（Soft Limit）設在機械極限內側', 'Stator 電流限制', '跟隨誤差過大或失速（有電流、沒速度）時自動停止'],
    },
    {
      title: '第一次閉迴路測試',
      items: ['Motion Magic 速度與加速度從 25% 開始', '每一階沒問題再加：25% → 50% → 75% → 100%', '任何一階怪怪的就 Disable，先看日誌再繼續'],
    },
  ],
  [
    {
      title: 'Before you start',
      items: ['Robot is up on blocks (wheels off the ground or secured), the area around the elevator is clear, and no hands inside the travel', 'Battery above 12.5 V', 'One person does nothing but watch Disable (Enter) and E-stop (space bar)'],
    },
    {
      title: 'Check direction and units',
      items: ['With short pulses under 5% voltage and under 0.5 s, confirm positive voltage moves up', 'Measure the real distance moved with a tape and compare with the position the code reads (a big difference means a wrong gear ratio or radius)'],
    },
    {
      title: 'Zeroing',
      items: ['With a limit switch: trigger it by hand first and confirm the code sees it', 'Without a limit switch: with a low current limit, slowly drive down into the hard stop and zero when the current rises'],
    },
    {
      title: 'Set limits',
      items: ['Soft upper and lower limits set inside the mechanical limits', 'Stator current limit', 'Stop automatically on excessive following error or a stall (current but no velocity)'],
    },
    {
      title: 'First closed-loop test',
      items: ['Start Motion Magic velocity and acceleration at 25%', 'Step up only when each stage is fine: 25% → 50% → 75% → 100%', 'If any stage looks odd, disable and check the log before continuing'],
    },
  ],
)

export function LearnPage() {
  const { lessonsDone } = useStore()
  const { unit0, setUnit0, mechanism } = useElevator()
  const done0 = unit0.filter(Boolean).length
  const unlocked = done0 === UNIT0_ITEMS

  return (
    <section aria-labelledby="t-learn">
      <div className="head">
        <div>
          <h1 id="t-learn">{t('實機資料教學', 'Real-robot lessons')}</h1>
          <p className="lead">
            {t('單元一、二隨時可以先讀；上機錄日誌或跑 SysId 之前，一定要先完成單元零。', 'Units 1 and 2 can be read any time; before recording logs or running SysId on the robot, you must finish unit 0.')}{' '}
            <HelpLink section={GUIDE_ANCHOR.learn} />
          </p>
        </div>
      </div>

      <div className="warn" style={{ marginTop: 0, marginBottom: 14 }}>
        {t(
          <>
          <b>網站不能當急停。</b>急停一律用 Driver Station：Enter 是 Disable，空白鍵是 E-Stop（E-Stop 後要重開機器人）。
          </>,
          <>
            <b>The site is not an e-stop.</b> Always use the Driver Station: Enter is Disable, the space bar is E-Stop (after an E-Stop you have to restart the robot).
          </>,
        )}
      </div>

      <details className="unit" open id="unit0">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元零：上機前的準備', 'Unit 0: prep before the robot')}</h2>
          <span className={'tag ' + (unlocked ? 'done' : 'must')}>
            {t(`必修，${done0} / ${UNIT0_ITEMS}`, `Required, ${done0} / ${UNIT0_ITEMS}`)}
          </span>
        </summary>
        <div className="body">
          <p className="small muted">{t('每次上機都要做一遍，不是做過一次就好。每一項全部確認後才打勾。', 'Do this every time you test on the robot, not just once. Check an item only after confirming all of it.')}</p>
          <ul className="checklist">
            {UNIT0.map((u, i) => (
              <li key={u.title}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!unit0[i]}
                    onChange={(e) => {
                      const next = [...unit0]
                      next[i] = e.target.checked
                      setUnit0(next)
                    }}
                  />
                  <span>
                    <b>
                      {i + 1}{t('．', '. ')}{u.title}
                    </b>
                    <ul>
                      {u.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {unlocked && (
            <div className="row" style={{ marginTop: 10 }}>
              <span className="ok" style={{ marginTop: 0 }}>
                {t(
                  <>
                  單元零完成，可以照單元一、二上機操作。
                  </>,
                  <>
                    Unit 0 done; you can follow units 1 and 2 on the robot.
                  </>,
                )}
              </span>
              <button className="btn small" type="button" onClick={() => setUnit0(Array(UNIT0_ITEMS).fill(false))}>
                {t('下次上機前清除勾選', 'Clear checks before next time')}
              </button>
            </div>
          )}
        </div>
      </details>

      <details className="unit" id="measure-ks">
        <summary>
          <h2 style={{ margin: 0 }}>{t('量 kS、kG（兩點法，不用 SysId）', 'Measure kS, kG (two-point method, no SysId)')}</h2>
          <span className="tag">{mechanism.measuredKs ? t(`已填 kS ${mechanism.measuredKs} V`, `kS ${mechanism.measuredKs} V entered`) : t('kS 一定要量', 'kS must be measured')}</span>
        </summary>
        {!unlocked && <LockNote onGo={() => document.getElementById('unit0')?.scrollIntoView({ behavior: 'smooth' })} />}
        <MeasureKsKg />
      </details>

      <details className="unit" id="unit1">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元一：用 AdvantageKit 錄日誌', 'Unit 1: record logs with AdvantageKit')}</h2>
          <span className={'tag' + (lessonsDone['unit1'] ? ' done' : '')}>{(lessonsDone['unit1'] ? t('已完成', 'Done') : unlocked ? t('可以開始', 'Ready to start') : t('可以先讀', 'Read ahead')) + (unlocked ? '' : t('；上機前先完成單元零', '; finish unit 0 before the robot'))}</span>
        </summary>
        {!unlocked && <LockNote onGo={() => document.getElementById('unit0')?.scrollIntoView({ behavior: 'smooth' })} />}
        <Unit1 />
      </details>

      <details className="unit" id="unit2">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元二：用 SysId 量測參數', 'Unit 2: measure gains with SysId')}</h2>
          <span className={'tag' + (lessonsDone['unit2'] ? ' done' : '')}>{(lessonsDone['unit2'] ? t('已完成', 'Done') : unlocked ? t('選用，可以開始', 'Optional, ready to start') : t('選用', 'Optional')) + (unlocked ? '' : t('；上機前先完成單元零', '; finish unit 0 before the robot'))}</span>
        </summary>
        {!unlocked && <LockNote onGo={() => document.getElementById('unit0')?.scrollIntoView({ behavior: 'smooth' })} />}
        <Unit2 />
      </details>

      <details className="unit" id="unit3">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元三：常見的坑', 'Unit 3: common pitfalls')}</h2>
          <span className={'tag' + (lessonsDone['unit3'] ? ' done' : '')}>{lessonsDone['unit3'] ? t('已完成', 'Done') : t('可以先讀', 'Read ahead')}</span>
        </summary>
        <Unit3 />
      </details>

      <details className="unit" id="unit4">
        <summary>
          <h2 style={{ margin: 0 }}>{t('單元四：期末檢核（沒看過的日誌）', 'Unit 4: final check (logs you haven’t seen)')}</h2>
          <span className={'tag' + (lessonsDone['unit4'] ? ' done' : '')}>{lessonsDone['unit4'] ? t('已通過', 'Passed') : t('讀完 2F 與單元一到三再做', 'Do after 2F and units 1–3')}</span>
        </summary>
        <Unit4 />
      </details>
    </section>
  )
}

/** 單元零沒完成時：內容可以讀，但提醒上機前一定要先做完單元零 */
function LockNote({ onGo }: { onGo: () => void }) {
  return (
    <div className="note lock-note">
      {t(
        <>
        <b>先讀沒關係，上機前一定要完成單元零。</b>這個單元的操作（錄日誌、跑 SysId）會讓電梯動起來。
        </>,
        <>
          <b>Reading ahead is fine, but finish unit 0 before going to the robot.</b> This unit’s steps (recording logs, running SysId) make the elevator move.{' '}
        </>,
      )}
      <button className="linkbtn" type="button" onClick={onGo}>
        {t('到單元零', 'Go to unit 0')}
      </button>
    </div>
  )
}
