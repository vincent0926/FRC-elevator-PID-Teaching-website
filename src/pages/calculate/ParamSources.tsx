import { Workflow } from '../../components/Workflow'
import { INPUT_ROWS, KIND_INFO, PARAM_ROWS, type SourceKind, type SourceRow } from './paramSources'
import { t } from '../../core/lang'

/** 1F「哪些參數可以算、哪些一定要量」對照表 */

const KINDS: SourceKind[] = ['calc', 'calcThenMeasure', 'measure', 'tune', 'constraint']

export function KindTag({ kind }: { kind: SourceKind }) {
  return (
    <span className={'src-tag src-' + kind}>
      {KIND_INFO[kind].label}
      <span className="src-code">{KIND_INFO[kind].tag}</span>
    </span>
  )
}

function Table({ rows, first }: { rows: SourceRow[]; first: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl src-tbl">
        <thead>
          <tr>
            <th>{first}</th>
            <th>{t('類型', 'Type')}</th>
            <th>{t('怎麼來', 'Where it comes from')}</th>
            <th>{t('要量的話用什麼', 'How to measure it')}</th>
            <th>{t('網站哪裡', 'Where on the site')}</th>
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
      <h2>{t('哪些參數可以算、哪些一定要量', 'Which gains can be calculated and which must be measured')}</h2>
      <p className="small" style={{ marginTop: 0 }}>
        {t(
          <>
          1F 算出來的是起點，不是答案。每個數字屬於下面五種之一，決定上機後該相信、重新量，還是自己調。
          </>,
          <>
            What 1F calculates is a starting point, not the answer. Every number falls into one of the five types below, which decides whether to trust it, re-measure it or tune it yourself on the robot.
          </>,
        )}
      </p>
      <Workflow />
      <ul className="src-kinds">
        {KINDS.map((k) => (
          <li key={k}>
            <KindTag kind={k} />
            <span className="small">{KIND_INFO[k].what}</span>
          </li>
        ))}
      </ul>
      <h3>{t('參數卡上的參數', 'Gains on the parameter card')}</h3>
      <Table rows={PARAM_ROWS} first={t('參數', 'Gain')} />
      <h3>{t('要填的機構資料', 'Mechanism data you enter')}</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        {t(
          <>
          參數算得準不準，取決於這些資料填得準不準。「算得準」的 kV 也只有在齒比、半徑填對時才準。
          </>,
          <>
            How accurate the gains are depends on how accurately these are filled in. Even the “model gets it right” kV is only right when the gear ratio and radius are right.
          </>,
        )}
      </p>
      <Table rows={INPUT_ROWS} first={t('資料', 'Data')} />
      <div className="note">
        {t(
          <>
          一句話：<b>kV 相信公式、kG 和 kA 先算再量、kS 一定要量、kP／kI／kD 在真的機器上調、Motion Magic 是你設的限制</b>。質量一定要秤，不要估。
          </>,
          <>
            In one line: <b>trust the formula for kV, calculate then measure kG and kA, always measure kS, tune kP/kI/kD on the real robot, and Motion Magic is a limit you choose</b>. Always weigh the masses; don’t guess.
          </>,
        )}
      </div>
    </div>
  )
}
