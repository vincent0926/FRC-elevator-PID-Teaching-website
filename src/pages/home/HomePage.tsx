import { UNIT0_ITEMS, useStore, type PageId } from '../../app/store'
import { LESSONS } from '../calculate/lessons'

const LOOP: { where: 'site' | 'robot'; tag: string; name: string; page?: PageId }[] = [
  { where: 'site', tag: '1F', name: '算理論值', page: 'calc' },
  { where: 'site', tag: '3F', name: '模擬', page: 'sim' },
  { where: 'robot', tag: '4F', name: '上機前準備', page: 'learn' },
  { where: 'robot', tag: '機器人', name: '上機測試並錄日誌' },
  { where: 'site', tag: '2F', name: '看調參建議', page: 'tune' },
  { where: 'site', tag: '3F', name: '模擬預覽', page: 'sim' },
  { where: 'robot', tag: '機器人', name: '上機驗證' },
  { where: 'site', tag: '1F', name: '達標後把參數寫進程式碼', page: 'calc' },
]

export function HomePage() {
  const { go, lessonsDone, unit0 } = useStore()
  const lessonCount = LESSONS.filter((l) => lessonsDone[l.id]).length
  const unit0Count = unit0.filter(Boolean).length

  return (
    <section aria-labelledby="t-home">
      <div className="head">
        <div>
          <h1 id="t-home">把電梯調好，而不是抄數字</h1>
          <p className="lead">
            從機構資料推出理論值，在模擬裡先跑一次，上機錄日誌，再讓網站告訴你問題出在哪。一次改一個參數，直到每個指標都達標。
          </p>
        </div>
      </div>

      <button className="path-card guide-card" type="button" onClick={() => go('guide')}>
        <h2>第一次來？先看使用說明</h2>
        <p>怎麼從機構資料走到看懂調參建議、每一層怎麼操作、卡住了怎麼辦。大約 30 分鐘走一遍。</p>
      </button>

      <h2>調參循環</h2>
      <ol className="loop">
        {LOOP.map((s, i) => (
          <li key={i} className={s.where}>
            <small>
              {i + 1}．{s.tag}
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
          在網站上做
        </span>
        <span>
          <i style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }} />
          在機器人上做
        </span>
      </div>

      <div className="paths">
        <button className="path-card" type="button" onClick={() => go('calc')}>
          <h2>第一次調電梯</h2>
          <p>從計算參數的五個關卡開始，一步一步推出 kG、kV、kA 和 PID 起始值，再到模擬裡試跑。</p>
          <p className="small muted" style={{ marginTop: 10 }}>
            教學關卡 {lessonCount} / {LESSONS.length}
          </p>
        </button>
        <button className="path-card" type="button" onClick={() => go('tune')}>
          <h2>已經有日誌了</h2>
          <p>直接匯入 AdvantageKit 的 .wpilog，對應欄位、做資料檢查，看位置、電壓、電流有沒有異常。</p>
          <p className="small muted" style={{ marginTop: 10 }}>
            上機前準備（單元零）{unit0Count} / {UNIT0_ITEMS}
          </p>
        </button>
      </div>

      <div className="panel" style={{ marginTop: 22 }}>
        <h2>這個網站不會做的事</h2>
        <p className="small" style={{ margin: 0 }}>
          網站<b>不連線機器人、不寫入馬達參數</b>。改參數與上機測試一律在機器人端操作，參數以隊上專案的程式碼為準。
          <b>網站不能當急停，急停一律用 Driver Station。</b>
        </p>
      </div>
    </section>
  )
}
