import type { ReactNode } from 'react'
import { convertArm } from '../../core/codegen'
import type { ArmParameterSet } from '../../schema/armParameterSet'

/** 手臂參數卡：左邊 SI（角度用 rad），灰字是 Phoenix 6 轉數制（換算由 codegen 負責） */

const f = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '—')
const R2D = 180 / Math.PI

const LABEL: Record<ArmParameterSet['source'], string> = { theory: '理論值', tuning: '調參建議值', custom: '自訂', measured: '實測值' }

/** tags：參數旁邊的小標籤（跟電梯 1F 一樣標「算／量／決定」），key 是參數名稱 */
export function ArmParamCard({ ps, notes, tags }: { ps: ArmParameterSet; notes?: Partial<Record<string, string>>; tags?: Partial<Record<string, ReactNode>> }) {
  const c = convertArm(ps)
  const { kS, kG, kV, kA } = ps.feedforward
  const { kP, kI, kD } = ps.feedback
  const rows: [string, string, string, string][] = [
    ['kS', f(kS, 3), 'V', notes?.kS ?? '伏特，不用換算'],
    ['kG', f(kG, 3), 'V', notes?.kG ?? '水平時的值；要乘 cos θ（Arm_Cosine）'],
    ['kV', f(kV, 3), 'V/(rad/s)', `${f(c.slot0.kV, 3)} V/rps`],
    ['kA', f(kA, 4), 'V/(rad/s²)', `${f(c.slot0.kA, 4)} V/(rps/s)`],
    ['kP', f(kP, 1), 'V/rad', `${f(c.slot0.kP, 1)} V/rot・每度 ${f(kP / R2D, 2)} V`],
    ['kI', f(kI, 2), 'V/(rad·s)', notes?.kI ?? `${f(c.slot0.kI, 2)} V/(rot·s)`],
    ['kD', f(kD, 3), 'V/(rad/s)', notes?.kD ?? `${f(c.slot0.kD, 3)} V/rps`],
    ['巡航角速度', f(ps.motionMagic.cruiseVelocity, 2), 'rad/s', `${f(ps.motionMagic.cruiseVelocity * R2D, 0)} °/s・${f(c.cruiseVelocity, 3)} rps${notes?.cruise ? '・' + notes.cruise : ''}`],
    ['角加速度', f(ps.motionMagic.acceleration, 1), 'rad/s²', `${f(c.acceleration, 2)} rps/s${notes?.accel ? '・' + notes.accel : ''}`],
  ]
  return (
    <>
      <h2>
        參數卡 <span className="chip">{LABEL[ps.source]}</span>
      </h2>
      <dl className="readout">
        {rows.map(([k, v, u, rot]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>
              {k}
              {tags?.[k]}
            </dt>
            <dd>{v}</dd>
            <span className="u">{u}</span>
            <span className="rot">{rot}</span>
          </div>
        ))}
      </dl>
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        灰字是 Phoenix 6 轉數制：SensorToMechanismRatio 設好後位置單位是「手臂轉幾圈」，1 圈 = 2π rad，kV、kA、kP、kD 乘 2π。GravityType 設 Arm_Cosine，角度 0 要是水平。
      </p>
    </>
  )
}
