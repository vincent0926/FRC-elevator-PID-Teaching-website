import { convert } from '../core/codegen'
import type { ParameterSet } from '../schema/parameterSet'

/** 參數卡：左邊 SI，灰字是 Phoenix 6 轉數制（換算由 codegen 負責）。 */

const SOURCE_LABEL: Record<ParameterSet['source'], string> = {
  theory: '理論值',
  tuning: '調參建議值',
  custom: '自訂',
  measured: '實測值',
}

const f = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function ParamCard({ ps, notes }: { ps: ParameterSet; notes?: Partial<Record<string, string>> }) {
  const c = convert(ps)
  const { kS, kG, kV, kA } = ps.feedforward
  const { kP, kI, kD } = ps.feedback
  const rows: [string, string, string, string][] = [
    ['kS', f(kS, 3), 'V', notes?.kS ?? '伏特，不用換算'],
    ['kG', f(kG, 3), 'V', notes?.kG ?? '伏特，不用換算'],
    ['kV', f(kV, 3), 'V/(m/s)', `${f(c.slot0.kV, 4)} V/rps`],
    ['kA', f(kA, 4), 'V/(m/s²)', `${f(c.slot0.kA, 5)} V/(rps/s)`],
    ['kP', f(kP, 1), 'V/m', `${f(c.slot0.kP, 3)} V/rot`],
    ['kI', f(kI, 2), 'V/(m·s)', notes?.kI ?? `${f(c.slot0.kI, 3)} V/(rot·s)`],
    ['kD', f(kD, 2), 'V/(m/s)', notes?.kD ?? `${f(c.slot0.kD, 3)} V/rps`],
    ['巡航速度', f(ps.motionMagic.cruiseVelocity, 2), 'm/s', `${f(c.cruiseVelocity, 2)} rps${notes?.cruise ? '・' + notes.cruise : ''}`],
    ['加速度', f(ps.motionMagic.acceleration, 1), 'm/s²', `${f(c.acceleration, 1)} rps/s${notes?.accel ? '・' + notes.accel : ''}`],
  ]
  return (
    <>
      <h2>
        參數卡 <span className="chip">{SOURCE_LABEL[ps.source]}</span>
      </h2>
      <dl className="readout">
        {rows.map(([k, v, u, rot]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
            <span className="u">{u}</span>
            <span className="rot">{rot}</span>
          </div>
        ))}
      </dl>
      {ps.slotByDirection && (
        <p className="small muted">
          摩擦不對稱：往上 Slot 0（kS {f(ps.slotByDirection.up.kS, 3)}、kG {f(ps.slotByDirection.up.kG, 3)}），往下 Slot 1（kS{' '}
          {f(ps.slotByDirection.down.kS, 3)}、kG {f(ps.slotByDirection.down.kG, 3)}）
        </p>
      )}
    </>
  )
}
