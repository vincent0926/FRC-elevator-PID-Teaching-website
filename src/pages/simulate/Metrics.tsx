import type { ReactNode } from 'react'
import type { MoveMetrics } from '../../core/physics/simulate'
import { describeSpec, diagnoseMove, fmtPos, moveFailures, SPEC_LABEL, type Spec, type SpecUnit } from '../../core/physics/spec'
import { t } from '../../core/lang'

/** 3F 指標表：每次移動一列，比較對象的指標並排 */


function MetricsRow({ m, label, spec, unit = 'm' }: { m: MoveMetrics; label: string; spec: Spec; unit?: SpecUnit }) {
  const cm = (v: number) => fmtPos(v, unit)
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{m.profileDuration.toFixed(2)} s</td>
      <td className={'num ' + (m.overshoot <= spec.overshoot ? 'pass' : 'fail')}>{cm(m.overshoot)}</td>
      <td className={'num ' + (m.settlingTime !== null && m.settlingTime <= spec.settling ? 'pass' : 'fail')}>
        {m.settlingTime === null ? t('未穩定', 'not settled') : `${m.settlingTime.toFixed(2)} s`}
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
  return <td className={f.length ? 'fail' : 'pass'}>{f.length ? `✗ ${f.map((k) => SPEC_LABEL[k]).join(t('、', ', '))}` : t('✓ 通過', '✓ Pass')}</td>
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
  const dirs = moveLabels ?? [t('往上', 'Up'), t('往下', 'Down')]
  const hints: string[] = []
  for (const m of moves) {
    if (m.saturationFraction > spec.saturation) hints.push(t('輸出電壓貼到電池電壓：馬達已經全力，調 PID 沒用，先降低 Motion Magic 速度或加速度。', 'Output voltage is pinned at battery voltage: the motor is already at full effort, so tuning PID won’t help. Lower the Motion Magic velocity or acceleration first.'))
    if (m.currentLimitFraction > spec.saturation) hints.push(t('觸發 Stator 電流限制：加速度太大或機構太重，屬於物理限制。', 'Stator current limit triggered: acceleration is too high or the mechanism too heavy; this is a physical limit.'))
    if (m.softLimitFraction > 0) hints.push(t('軟體限位擋住了：位置到了限位，控制器把那個方向的輸出關掉（neutral）。目標設在限位外面就到不了，會在限位附近抖。', 'Blocked by the soft limit: at the limit the controller turns off output in that direction (neutral). A target beyond the limit can’t be reached and it jitters around the limit.'))
    if (m.supplyLimitFraction > spec.saturation) hints.push(t('觸發 Supply 電流限制：從電池拿的電流被限制，加速變慢。保護斷路器用的，設太低電梯會變肉。', 'Supply current limit triggered: the current drawn from the battery is capped, so acceleration slows. It protects the breaker; set too low, the elevator gets sluggish.'))
    if (m.holdVoltageRipple > spec.ripple) hints.push(t('到位後電壓一直抖：可能在振盪（kP 太大、控制週期太長、延遲），或 kD 把雜訊放大了。', 'Voltage keeps jittering after arrival: possibly oscillating (kP too big, control period too long, delay), or kD amplifying noise.'))
  }
  const moveLabel = (m: MoveMetrics, i: number) => `${dirs[i === 0 ? 0 : 1]} → ${unit === 'rad' ? fmtPos(m.goal, 'rad', 0) : `${m.goal.toFixed(2)} m`}${moves.some((x) => x.slot === 1) ? t(`（Slot ${m.slot}）`, ` (Slot ${m.slot})`) : ''}`
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h2>{t('指標', 'Metrics')}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('移動', 'Move')}</th>
              <th className="num">{t('軌跡時間', 'Profile time')}</th>
              <th className="num">{t('超調', 'Overshoot')}</th>
              <th className="num">{t('穩定時間', 'Settling time')}</th>
              <th className="num">{t('穩態誤差', 'Steady-state error')}</th>
              <th className="num">{t('最大跟隨誤差', 'Max following error')}</th>
              <th className="num">{t('峰值電流', 'Peak current')}</th>
              <th className="num">{t('電壓飽和', 'Voltage saturation')}</th>
              <th className="num">{t('到位電壓抖動', 'Voltage jitter at arrival')}</th>
              <th>{t('結果', 'Result')}</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((m, i) => (
              <MetricsRow key={i} m={m} label={moveLabel(m, i)} spec={spec} unit={unit} />
            ))}
            {other?.map((m, i) => (
              <MetricsRow key={'o' + i} m={m} label={`${otherLabel}${t('：', ': ')}${dirs[i === 0 ? 0 : 1]}`} spec={spec} unit={unit} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="small" style={{ margin: '10px 0 0' }}>
        {t('整體：', 'Overall: ')}
        {moves.every((m) => moveFailures(m, spec).length === 0) ? (
          <b className="pass">{t('每一次移動都達標', 'Every move passes')}</b>
        ) : (
          <>
            <b className="fail">
              {t(`${moves.filter((m) => moveFailures(m, spec).length > 0).length} / ${moves.length} 次移動沒過`, `${moves.filter((m) => moveFailures(m, spec).length > 0).length} / ${moves.length} moves failed`)}
            </b>
            {t('，看下面是哪一次、哪一項。', '; see below for which move and which item.')}
          </>
        )}
      </p>
      {moves.map((m, i) =>
        diagnoseMove(m, spec, unit).length ? (
          <div key={i} className="move-diag">
            <b className="small">{moveLabel(m, i)}</b>
            <ul className="small">
              {diagnoseMove(m, spec, unit).map((d) => (
                <li key={d.key}>
                  <b>{d.label}</b> {d.actual}{t('（標準 ≤ ', ' (limit ≤ ')}{d.limit}{t('）→ 可能：', ') → likely: ')}{d.cause}{t(' → 先試：', ' → try first: ')}{d.next}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        {t('達標標準（教學用，不是 FRC 官方標準）：', 'Pass criteria (for teaching, not an official FRC standard): ')}{describeSpec(spec, unit)}{t('。', '.')}
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
