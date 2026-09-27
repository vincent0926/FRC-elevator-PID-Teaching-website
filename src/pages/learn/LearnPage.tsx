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
          <p className="lead">調參建議需要好的實機資料，而資料要安全地錄。單元一、二隨時可以先讀；但要上機錄日誌或跑 SysId 之前，一定要先完成單元零的檢查。</p>
        </div>
      </div>

      <div className="warn" style={{ marginTop: 0, marginBottom: 14 }}>
        <b>網站不能當急停。</b>急停一律用 Driver Station：Enter 是 Disable，空白鍵是 E-Stop（E-Stop 後要重開機器人）。
      </div>

      <details className="unit" open id="unit0">
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
                單元零完成，可以照單元一、二上機操作。
              </span>
              <button className="btn small" type="button" onClick={() => setUnit0(Array(UNIT0_ITEMS).fill(false))}>
                下次上機前清除勾選
              </button>
            </div>
          )}
        </div>
      </details>

      <details className="unit">
        <summary>
          <h2 style={{ margin: 0 }}>單元一：用 AdvantageKit 錄日誌</h2>
          <span className={'tag' + (lessonsDone['unit1'] ? ' done' : '')}>{(lessonsDone['unit1'] ? '已完成' : unlocked ? '可以開始' : '可以先讀') + (unlocked ? '' : '；上機前先完成單元零')}</span>
        </summary>
        {!unlocked && <LockNote onGo={() => document.getElementById('unit0')?.scrollIntoView({ behavior: 'smooth' })} />}
        <Unit1 />
      </details>

      <details className="unit">
        <summary>
          <h2 style={{ margin: 0 }}>單元二：用 SysId 量測參數</h2>
          <span className={'tag' + (lessonsDone['unit2'] ? ' done' : '')}>{(lessonsDone['unit2'] ? '已完成' : unlocked ? '選用，可以開始' : '選用') + (unlocked ? '' : '；上機前先完成單元零')}</span>
        </summary>
        {!unlocked && <LockNote onGo={() => document.getElementById('unit0')?.scrollIntoView({ behavior: 'smooth' })} />}
        <Unit2 />
      </details>
    </section>
  )
}

/** 單元零沒完成時：內容可以讀，但提醒上機前一定要先做完單元零 */
function LockNote({ onGo }: { onGo: () => void }) {
  return (
    <div className="note lock-note">
      <b>先讀沒關係，上機前一定要完成單元零。</b>這個單元的操作（錄日誌、跑 SysId）會讓電梯動起來。
      <button className="linkbtn" type="button" onClick={onGo}>
        到單元零
      </button>
    </div>
  )
}
