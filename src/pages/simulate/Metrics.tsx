import type { MoveMetrics } from '../../core/physics/simulate'
import { DEFAULT_SPEC } from '../../core/physics/spec'

/** 3F 指標表：每次移動一列，比較對象的指標並排 */

const cm = (v: number) => `${(v * 100).toFixed(1)} cm`

function MetricsRow({ m, label }: { m: MoveMetrics; label: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{m.profileDuration.toFixed(2)} s</td>
      <td className={'num ' + (m.overshoot <= DEFAULT_SPEC.overshoot ? 'pass' : 'fail')}>{cm(m.overshoot)}</td>
      <td className={'num ' + (m.settlingTime !== null && m.settlingTime <= DEFAULT_SPEC.settling ? 'pass' : 'fail')}>
        {m.settlingTime === null ? '未穩定' : `${m.settlingTime.toFixed(2)} s`}
      </td>
      <td className={'num ' + (m.steadyStateError <= DEFAULT_SPEC.steadyState ? 'pass' : 'fail')}>{cm(m.steadyStateError)}</td>
      <td className={'num ' + (m.maxFollowingError <= DEFAULT_SPEC.following ? 'pass' : 'fail')}>{cm(m.maxFollowingError)}</td>
      <td className="num">{m.peakStatorCurrent.toFixed(0)} A</td>
      <td className={'num ' + (m.saturationFraction <= DEFAULT_SPEC.saturation ? 'pass' : 'fail')}>{(m.saturationFraction * 100).toFixed(1)}%</td>
      <td className={'num ' + (m.holdVoltageRipple <= DEFAULT_SPEC.ripple ? 'pass' : 'fail')}>{m.holdVoltageRipple.toFixed(2)} V</td>
    </tr>
  )
}

export function MetricsTable({ moves, other, otherLabel }: { moves: MoveMetrics[]; other: MoveMetrics[] | null; otherLabel: string }) {
  const hints: string[] = []
  for (const m of moves) {
    if (m.saturationFraction > DEFAULT_SPEC.saturation) hints.push('輸出電壓貼到電池電壓：馬達已經全力，調 PID 沒用，先降低 Motion Magic 速度或加速度。')
    if (m.currentLimitFraction > DEFAULT_SPEC.saturation) hints.push('觸發 Stator 電流限制：加速度太大或機構太重，屬於物理限制。')
    if (m.holdVoltageRipple > DEFAULT_SPEC.ripple) hints.push('到位後電壓一直抖：可能在振盪（kP 太大、控制週期太長、延遲），或 kD 把雜訊放大了。')
  }
  const moveLabel = (m: MoveMetrics, i: number) => `${i === 0 ? '往上' : '往下'} → ${m.goal.toFixed(2)} m${moves.some((x) => x.slot === 1) ? `（Slot ${m.slot}）` : ''}`
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
            </tr>
          </thead>
          <tbody>
            {moves.map((m, i) => (
              <MetricsRow key={i} m={m} label={moveLabel(m, i)} />
            ))}
            {other?.map((m, i) => (
              <MetricsRow key={'o' + i} m={m} label={`${otherLabel}：${i === 0 ? '往上' : '往下'}`} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        達標標準：超調 ≤ 1 cm、軌跡結束後 0.5 s 內穩定在 ±1 cm、穩態誤差 ≤ 1 cm、跟隨誤差 ≤ 3 cm、電壓飽和 ≤ 2%、到位後電壓抖動 ≤ 0.3 V。
      </p>
      {[...new Set(hints)].map((h) => (
        <div key={h} className="warn">
          {h}
        </div>
      ))}
    </div>
  )
}
