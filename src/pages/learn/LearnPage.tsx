import { UNIT0_ITEMS, useStore } from '../../app/store'
import { Quiz } from '../../components/Quiz'
import { SAMPLE_KEYS } from '../../core/log/sampleLog'

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

const LOG_FIELDS: [string, string, string][] = [
  [SAMPLE_KEYS.position, '位置（m，鼓輪線位移）', '必要'],
  [SAMPLE_KEYS.velocity, '速度（m/s）', '必要'],
  [SAMPLE_KEYS.reference, 'Motion Magic 目前的參考位置（m）', '必要'],
  [SAMPLE_KEYS.referenceSlope, '參考速度（m/s）', '建議'],
  [SAMPLE_KEYS.appliedVolts, '輸出電壓（V）', '必要'],
  [SAMPLE_KEYS.statorCurrent, 'Stator 電流（A）', '建議'],
  [SAMPLE_KEYS.closedLoopOutput, '回授輸出 P+I+D（V）', '建議'],
  [SAMPLE_KEYS.feedforwardOutput, '前饋輸出（V）', '建議'],
  [SAMPLE_KEYS.battery, '電池電壓（AdvantageKit 自動記錄）', '自動'],
  [SAMPLE_KEYS.enabled, '是否 Enable（AdvantageKit 自動記錄）', '自動'],
]

export function LearnPage() {
  const { unit0, setUnit0, lessonsDone, markLesson } = useStore()
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
        {unlocked && (
          <div className="body">
            <div className="goal" style={{ fontSize: 13, borderLeft: '3px solid var(--yellow)', paddingLeft: 10 }}>
              學習目標：知道調參要記錄哪些欄位、怎麼錄一段「有用」的測試，並把日誌匯入網站。
            </div>
            <h3>1. 要記錄的欄位</h3>
            <p className="small">
              範例程式（<code>robot-example/</code>）的 <code>ElevatorIOInputs</code> 已經全部記了。自己寫的話，名稱不同也沒關係，匯入時可以手動對應。
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>欄位</th>
                    <th>內容</th>
                    <th>必要性</th>
                  </tr>
                </thead>
                <tbody>
                  {LOG_FIELDS.map(([k, d, r]) => (
                    <tr key={k}>
                      <td>
                        <code>{k}</code>
                      </td>
                      <td>{d}</td>
                      <td>{r}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small" style={{ marginTop: 8 }}>
              回授輸出和前饋輸出來自 TalonFX 的 <code>ClosedLoopProportionalOutput</code>、<code>ClosedLoopIntegratedOutput</code>、
              <code>ClosedLoopDerivativeOutput</code> 與 <code>ClosedLoopOutput</code>。有了它們，網站才分得出是前饋不準還是 PID 在硬撐。
            </p>

            <h3>2. 錄一段有用的測試</h3>
            <ol className="small" style={{ paddingLeft: 18 }}>
              <li>先做完單元零。</li>
              <li>在幾個高度之間來回：例如 20% → 75% → 20% → 50% → 5% 的行程，每次到位後停 2 秒。</li>
              <li>要有往上也要有往下，停住的時間也要有：kG、kS 要靠「上、下、停」三種資料才分得開。</li>
              <li>一次測試只改一個參數，並記下改了什麼（寫在日誌檔名或隊上的調參紀錄）。</li>
              <li>電池 12.5 V 以上再錄；電池沒電時量到的 kG、kV 會偏大。</li>
            </ol>

            <h3>3. 取得日誌檔</h3>
            <ul className="small" style={{ paddingLeft: 18 }}>
              <li>AdvantageKit 在實機上把 .wpilog 寫到 roboRIO 的 USB 隨身碟（<code>/U/logs</code>），沒插隨身碟時寫到 <code>/home/lvuser/logs</code>。</li>
              <li>用 AdvantageScope 的「File → Download Logs」連上機器人下載，或直接拔隨身碟。</li>
              <li>先在 AdvantageScope 打開看一下：欄位有沒有值、單位對不對（位置應該是公尺，不是圈數）。</li>
            </ul>

            <h3>4. 匯入網站</h3>
            <p className="small">
              到 2F 調參建議把檔案拖進去。第一次要確認欄位對應，之後自動套用。資料檢查全部沒有 ✕ 才能用來分析。沒有機器人也可以在 2F 產生範例日誌練習。
            </p>

            <Quiz
              quiz={{
                question: '你只錄了電梯一路往上移動的資料，沒有往下、也沒有停住。調參建議會？',
                options: ['可以正常分析所有參數', '分不開 kS 和 kG，要補錄往下和停住的資料', '只要資料夠長就沒問題'],
                answer: 1,
                explain: '往上時 kS 和 kG 同號、加在一起，要有往下（kS 反號）和停住（只剩 kG）才分得開。',
                hints: ['往上時摩擦力和重力都朝下。', '往下時摩擦力方向會反過來，重力不會。', '要有不同方向的資料才能把兩個加在一起的量拆開。'],
              }}
              done={lessonsDone['unit1']}
              onCorrect={() => markLesson('unit1')}
            />
          </div>
        )}
      </details>

      <details className={'unit' + (unlocked ? '' : ' locked')} onToggle={(e) => !unlocked && ((e.currentTarget as HTMLDetailsElement).open = false)}>
        <summary aria-disabled={!unlocked}>
          <h2 style={{ margin: 0 }}>單元二：用 SysId 量測參數</h2>
          <span className="tag">{unlocked ? '選用' : '選用，完成單元零後開放'}</span>
        </summary>
        {unlocked && (
          <div className="body">
            <div className="goal" style={{ fontSize: 13, borderLeft: '3px solid var(--yellow)', paddingLeft: 10 }}>
              學習目標：知道 SysId 四個測試在量什麼、怎麼安全地跑，以及結果怎麼跟理論值比。
            </div>
            <p className="small">
              電梯行程短，動態測試很容易撞到上下限，所以 SysId 是<b>選用</b>。多數時候「理論值 + 上機錄日誌 + 調參建議」就夠了。
            </p>
            <h3>四個測試</h3>
            <table className="tbl">
              <tbody>
                <tr>
                  <th>準靜態（Quasistatic）往上 / 往下</th>
                  <td>電壓慢慢增加，加速度很小，主要量 kS、kG、kV</td>
                </tr>
                <tr>
                  <th>動態（Dynamic）往上 / 往下</th>
                  <td>一次給固定電壓，主要量 kA</td>
                </tr>
              </tbody>
            </table>
            <h3>安全設定</h3>
            <ul className="small" style={{ paddingLeft: 18 }}>
              <li>
                把 <code>SysIdRoutine.Config</code> 的步階電壓調低（例如 4 V 以下）、ramp rate 調小（例如 0.5 V/s），並設 timeout。
              </li>
              <li>每個測試從行程中間附近開始，快到上下限時放開按鈕（Disable），寧可資料短一點。</li>
              <li>軟體上下限保持開啟；限位觸發後的資料不要用。</li>
              <li>Phoenix 6 用 <code>SignalLogger</code> 記錄，匯出後用 WPILib SysId 工具或 AdvantageScope 分析。</li>
            </ul>
            <h3>跟理論值比</h3>
            <p className="small">
              把 SysId 量到的 kS、kG、kV、kA 跟 1F 的理論值比較。kV 差超過 20% 先檢查齒比和半徑；kG 差很多先檢查質量和配重；kA 本來就比較難量準，差 30% 內都算正常。
              記得 SysId 的單位要跟 Phoenix 6 一致（轉數制），網站的理論值是 SI，參數卡灰字才是轉數制。
            </p>
          </div>
        )}
      </details>
    </section>
  )
}
