import { INPUT_ROWS, KIND_INFO, PARAM_ROWS, type SourceKind, type SourceRow } from './paramSources'

/** 1F「哪些參數可以算、哪些一定要量」對照表 */

const KINDS: SourceKind[] = ['calc', 'calcThenMeasure', 'measure', 'choose']

export function KindTag({ kind }: { kind: SourceKind }) {
  return <span className={'src-tag src-' + kind}>{KIND_INFO[kind].label}</span>
}

function Table({ rows, first }: { rows: SourceRow[]; first: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl src-tbl">
        <thead>
          <tr>
            <th>{first}</th>
            <th>類型</th>
            <th>怎麼來</th>
            <th>要量的話用什麼</th>
            <th>網站哪裡</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <th>{r.name}</th>
              <td>
                <KindTag kind={r.kind} />
              </td>
              <td>{r.how}</td>
              <td>{r.measure}</td>
              <td className="muted">{r.where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ParamSources() {
  return (
    <div className="panel" id="param-sources">
      <h2>哪些參數可以算、哪些一定要量</h2>
      <p className="small" style={{ marginTop: 0 }}>
        1F 算出來的不是「答案」，是起點。每個數字屬於下面四種之一，知道它是哪一種，就知道上機之後該相信它、驗證它，還是重新量。
      </p>
      <ul className="src-kinds">
        {KINDS.map((k) => (
          <li key={k}>
            <KindTag kind={k} />
            <span className="small">{KIND_INFO[k].what}</span>
          </li>
        ))}
      </ul>
      <h3>參數卡上的參數</h3>
      <Table rows={PARAM_ROWS} first="參數" />
      <h3>要填的機構資料</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        參數算得準不準，取決於這些資料填得準不準。「算得準」的 kV 也只有在齒比、半徑填對時才準。
      </p>
      <Table rows={INPUT_ROWS} first="資料" />
      <div className="note">
        一句話：<b>kV 相信公式、kG 和 kA 先算再量、kS 一定要量、kP／kI／kD 和 Motion Magic 是你決定的</b>。質量一定要秤，不要估。
      </div>
    </div>
  )
}
