import { UNIT0_ITEMS, useStore } from '../../app/store'
import { Unit1 } from './Unit1'
import { Unit2 } from './Unit2'

/**
 * 4F 實機資料教學。單元零必修，全部勾完才開放單元一、二。
 * 網站本身不能當急停，急停一律用 Driver Station。
 */

const UNIT0: { title: string; items: string[] }[] = [
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
]

export function LearnPage() {
  const { unit0, setUnit0, lessonsDone } = useStore()
  const done0 = unit0.filter(Boolean).length
  const unlocked = done0 === UNIT0_ITEMS

  return (
    <section aria-labelledby="t-learn">
      <div className="head">
        <div>
          <h1 id="t-learn">實機資料教學</h1>
          <p className="lead">調參建議需要好的實機資料，而資料要安全地錄。先完成單元零的檢查，才能進入後面的單元。</p>
        </div>
      </div>

      <div className="warn" style={{ marginTop: 0, marginBottom: 14 }}>
        <b>網站不能當急停。</b>急停一律用 Driver Station：Enter 是 Disable，空白鍵是 E-Stop（E-Stop 後要重開機器人）。
      </div>

      <details className="unit" open>
        <summary>
          <h2 style={{ margin: 0 }}>單元零：上機前的準備</h2>
          <span className={'tag ' + (unlocked ? 'done' : 'must')}>
            必修，{done0} / {UNIT0_ITEMS}
          </span>
        </summary>
        <div className="body">
          <p className="small muted">每次上機都要做一遍，不是做過一次就好。每一項全部確認後才打勾。</p>
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
                      {i + 1}．{u.title}
                    </b>
                    <ul>
                      {u.items.map((t) => (
                        <li key={t}>{t}</li>
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
                單元零完成，單元一、二已開放。
              </span>
              <button className="btn small" type="button" onClick={() => setUnit0(Array(UNIT0_ITEMS).fill(false))}>
                下次上機前清除勾選
              </button>
            </div>
          )}
        </div>
      </details>

      <details className={'unit' + (unlocked ? '' : ' locked')} onToggle={(e) => !unlocked && ((e.currentTarget as HTMLDetailsElement).open = false)}>
        <summary aria-disabled={!unlocked}>
          <h2 style={{ margin: 0 }}>單元一：用 AdvantageKit 錄日誌</h2>
          <span className={'tag' + (lessonsDone['unit1'] ? ' done' : '')}>{unlocked ? (lessonsDone['unit1'] ? '已完成' : '可以開始') : '完成單元零後開放'}</span>
        </summary>
        {unlocked && <Unit1 />}
      </details>

      <details className={'unit' + (unlocked ? '' : ' locked')} onToggle={(e) => !unlocked && ((e.currentTarget as HTMLDetailsElement).open = false)}>
        <summary aria-disabled={!unlocked}>
          <h2 style={{ margin: 0 }}>單元二：用 SysId 量測參數</h2>
          <span className={'tag' + (lessonsDone['unit2'] ? ' done' : '')}>{unlocked ? (lessonsDone['unit2'] ? '已完成' : '選用，可以開始') : '選用，完成單元零後開放'}</span>
        </summary>
        {unlocked && <Unit2 />}
      </details>
    </section>
  )
}
