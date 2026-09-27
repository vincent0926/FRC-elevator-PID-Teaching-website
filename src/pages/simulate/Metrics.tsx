import type { ReactNode } from 'react'
import type { MoveMetrics } from '../../core/physics/simulate'
import { describeSpec, diagnoseMove, fmtPos, moveFailures, SPEC_LABEL, type Spec, type SpecUnit } from '../../core/physics/spec'

/** 3F 指標表：每次移動一列，比較對象的指標並排 */


function MetricsRow({ m, label, spec, unit = 'm' }: { m: MoveMetrics; label: string; spec: Spec; unit?: SpecUnit }) {
  const cm = (v: number) => fmtPos(v, unit)
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{m.profileDuration.toFixed(2)} s</td>
      <td className={'num ' + (m.overshoot <= spec.overshoot ? 'pass' : 'fail')}>{cm(m.overshoot)}</td>
      <td className={'num ' + (m.settlingTime !== null && m.settlingTime <= spec.settling ? 'pass' : 'fail')}>
        {m.settlingTime === null ? '未穩定' : `${m.settlingTime.toFixed(2)} s`}
      </td>
      <td className={'num ' + (m.steadyStateError <= spec.steadyState ? 'pass' : 'fail')}>{cm(m.steadyStateError)}</td>
      <td className={'num ' + (m.maxFollowingError <= spec.following ? 'pass' : 'fail')}>{cm(m.maxFollowingError)}</td>
      <td className="num">{m.peakStatorCurrent.toFixed(0)} A</td>
      <td className={'num ' + (m.saturationFraction <= spec.saturation ? 'pass' : 'fail')}>{(m.saturationFraction * 100).toFixed(1)}%</td>
      <td className={'num ' + (m.holdVoltageRipple <= spec.ripple ? 'pass' : 'fail')}>{m.holdVoltageRipple.toFixed(2)} V</td>
      <MoveResult m={m} spec={spec} />
    </tr>
  )
}

function MoveResult({ m, spec }: { m: MoveMetrics; spec: Spec }) {
  const f = moveFailures(m, spec)
  return <td className={f.length ? 'fail' : 'pass'}>{f.length ? `✗ ${f.map((k) => SPEC_LABEL[k]).join('、')}` : '✓ 通過'}</td>
}

export function MetricsTable({
  moves,
  other,
  otherLabel,
  spec,
  editor,
  unit = 'm',
  moveLabels,
}: {
  moves: MoveMetrics[]
  other: MoveMetrics[] | null
  otherLabel: string
  spec: Spec
  editor?: ReactNode
  /** 位置單位：電梯 m、手臂 rad（顯示度） */
  unit?: SpecUnit
  /** 每次移動的名稱（預設「往上／往下」） */
  moveLabels?: [string, string]
}) {
  const dirs = moveLabels ?? ['往上', '往下']
  const hints: string[] = []
  for (const m of moves) {
    if (m.saturationFraction > spec.saturation) hints.push('輸出電壓貼到電池電壓：馬達已經全力，調 PID 沒用，先降低 Motion Magic 速度或加速度。')
    if (m.currentLimitFraction > spec.saturation) hints.push('觸發 Stator 電流限制：加速度太大或機構太重，屬於物理限制。')
    if (m.softLimitFraction > 0) hints.push('軟體限位擋住了：位置到了限位，控制器把那個方向的輸出關掉（neutral）。目標設在限位外面就到不了，會在限位附近抖。')
    if (m.supplyLimitFraction > spec.saturation) hints.push('觸發 Supply 電流限制：從電池拿的電流被限制，加速變慢。保護斷路器用的，設太低電梯會變肉。')
    if (m.holdVoltageRipple > spec.ripple) hints.push('到位後電壓一直抖：可能在振盪（kP 太大、控制週期太長、延遲），或 kD 把雜訊放大了。')
  }
  const moveLabel = (m: MoveMetrics, i: number) => `${dirs[i === 0 ? 0 : 1]} → ${unit === 'rad' ? fmtPos(m.goal, 'rad', 0) : `${m.goal.toFixed(2)} m`}${moves.some((x) => x.slot === 1) ? `（Slot ${m.slot}）` : ''}`
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h2>指標</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>移動</th>
              <th className="num">軌跡時間</th>
              <th className="num">超調</th>
              <th className="num">穩定時間</th>
              <th className="num">穩態誤差</th>
              <th className="num">最大跟隨誤差</th>
              <th className="num">峰值電流</th>
              <th className="num">電壓飽和</th>
              <th className="num">到位電壓抖動</th>
              <th>結果</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((m, i) => (
              <MetricsRow key={i} m={m} label={moveLabel(m, i)} spec={spec} unit={unit} />
            ))}
            {other?.map((m, i) => (
              <MetricsRow key={'o' + i} m={m} label={`${otherLabel}：${dirs[i === 0 ? 0 : 1]}`} spec={spec} unit={unit} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="small" style={{ margin: '10px 0 0' }}>
        整體：
        {moves.every((m) => moveFailures(m, spec).length === 0) ? (
          <b className="pass">每一次移動都達標</b>
        ) : (
          <b className="fail">
            {moves.filter((m) => moveFailures(m, spec).length > 0).length} / {moves.length} 次移動沒過
          </b>
        )}
        ——整體通過要每一次都過，所以先看是哪一次、哪一項沒過。
      </p>
      {moves.map((m, i) =>
        diagnoseMove(m, spec, unit).length ? (
          <div key={i} className="move-diag">
            <b className="small">{moveLabel(m, i)}</b>
            <ul className="small">
              {diagnoseMove(m, spec, unit).map((d) => (
                <li key={d.key}>
                  <b>{d.label}</b> {d.actual}（標準 ≤ {d.limit}）→ 可能：{d.cause} → 先試：{d.next}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        達標標準（教學用，不是 FRC 官方標準）：{describeSpec(spec, unit)}。
      </p>
      {editor}
      {[...new Set(hints)].map((h) => (
        <div key={h} className="warn">
          {h}
        </div>
      ))}
    </div>
  )
}
