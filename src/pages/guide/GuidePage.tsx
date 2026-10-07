import { useStore, type PageId } from '../../app/store'
import { guideContent, type GuideSection } from './guideContent'

/**
 * 使用說明：這個網站怎麼用。第一次用的路線 → 每一層的操作 → 名詞速查 → 常見問題。
 * 樓層頁的「怎麼用這一頁？」會跳到對應的那一段（section id，Shell 會把 <details> 打開並捲過來）。
 */

const FLOOR_NAME: Partial<Record<PageId, string>> = { calc: '計算參數', sim: '模擬', tune: '調參建議', learn: '實機資料教學' }

function Section({ s, go }: { s: GuideSection; go: (p: PageId) => void }) {
  return (
    <details className="panel scen guide-sec" id={s.id} style={{ marginTop: 14 }}>
      <summary>
        <b>
          {s.floor}　{s.title}
        </b>
        <span className="small muted">{s.what}</span>
      </summary>
      <div className="guide-body">
        <h3>怎麼操作</h3>
        <ol className="guide-steps">
          {s.steps.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
        <h3>看什麼</h3>
        <ul className="guide-list">
          {s.look.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        {s.stuck.length > 0 && (
          <>
            <h3>卡住了</h3>
            <dl className="guide-stuck">
              {s.stuck.map(([q, a], i) => (
                <div key={i}>
                  <dt>{q}</dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn small" type="button" onClick={() => go(s.page)}>
            前往 {s.floor}　{FLOOR_NAME[s.page]}
          </button>
        </div>
      </div>
    </details>
  )
}

export function GuidePage() {
  const { track, go } = useStore()
  const c = guideContent(track ?? 'elevator')
  const thing = track === 'arm' ? '手臂' : '電梯'

  return (
    <section aria-labelledby="t-guide">
      <div className="head">
        <div>
          <h1 id="t-guide">使用說明</h1>
          <p className="lead">{c.intro}</p>
        </div>
        <span className="phase">{thing}</span>
      </div>

      <div className="panel" id="guide-start">
        <h2>第一次用，照這個順序</h2>
        <ol className="guide-route">
          {c.start.map((s, i) => (
            <li key={i}>
              <span className="tag">{s.floor}</span>
              <span>{s.text}</span>
              <button className="btn small" type="button" onClick={() => go(s.page)}>
                {s.floor === '實機' ? '去 2F' : `去 ${s.floor}`}
              </button>
            </li>
          ))}
        </ol>
        <p className="small muted" style={{ marginBottom: 0 }}>
          還沒有機器人資料也沒關係：1F、3F、2F 的範例日誌都能練習。網站<b>不連線機器人、不寫入馬達參數</b>，急停一律用 Driver Station。
        </p>
      </div>

      <h2 style={{ marginTop: 26 }}>每一層怎麼用</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        點開看操作步驟。每一頁上面的「怎麼用這一頁？」也會直接帶你來這裡。
      </p>
      {c.sections.map((s) => (
        <Section key={s.id} s={s} go={go} />
      ))}

      <details className="panel scen" id="guide-terms" style={{ marginTop: 14 }}>
        <summary>
          <b>名詞速查</b>
          <span className="small muted">kS、kG、kV、kA、kP、kI、kD 各自在做什麼。</span>
        </summary>
        <dl className="guide-terms">
          {c.terms.map((t) => (
            <div key={t.name}>
              <dt>{t.name}</dt>
              <dd>{t.text}</dd>
            </div>
          ))}
        </dl>
      </details>

      <details className="panel scen" id="guide-faq" style={{ marginTop: 14 }}>
        <summary>
          <b>常見問題</b>
          <span className="small muted">資料存在哪裡、畫面是舊的、參數怎麼放進機器人…</span>
        </summary>
        <dl className="guide-stuck" style={{ marginTop: 12 }}>
          {c.faq.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  )
}
