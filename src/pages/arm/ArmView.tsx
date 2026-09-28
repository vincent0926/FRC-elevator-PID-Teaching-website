import type { SimResult } from '../../core/physics/simulate'
import type { ArmMechanism } from '../../schema/armParameterSet'

/**
 * 手臂側視圖：轉軸、水平參考線、角度範圍、目前角度（實線）與軌跡目標（虛線）。
 * 零點設錯的情境：畫的是真正的角度（控制器以為的角度 + 偏差），讀數兩個都顯示。
 */

const W = 220
const H = 220
const CX = 70
const CY = 130
const R2D = 180 / Math.PI

export function ArmView({ result, arm, goal, idx, zeroOffset = 0 }: { result: SimResult | null; arm: ArmMechanism; goal: number; idx: number | null; zeroOffset?: number }) {
  const k = idx ?? (result ? result.t.length - 1 : 0)
  const th = result ? result.pos[k] : arm.minAngle
  const ref = result && idx !== null ? result.refPos[k] : goal
  const len = 120
  const scale = len / Math.max(arm.armLength, arm.payloadDistance, 0.05)
  const pt = (a: number, r: number) => [CX + Math.cos(a) * r, CY - Math.sin(a) * r] as const
  const real = th + zeroOffset
  const [ex, ey] = pt(real, arm.armLength * scale)
  const [tx, ty] = pt(ref + zeroOffset, arm.armLength * scale)
  const [px, py] = pt(real, arm.payloadDistance * scale)
  const [gx, gy] = pt(real, arm.cgDistance * scale)
  // 角度範圍的弧
  const arc = (a0: number, a1: number, r: number) => {
    const [x0, y0] = pt(a0, r)
    const [x1, y1] = pt(a1, r)
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${x1} ${y1}`
  }
  return (
    <div className="elev-view arm-view" aria-label="手臂側視圖" role="img">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <line x1={10} y1={CY} x2={W - 6} y2={CY} className="av-horizon" />
        <path d={arc(arm.minAngle + zeroOffset, arm.maxAngle + zeroOffset, 34)} className="av-range" />
        <rect x={CX - 10} y={CY} width={20} height={H - CY - 16} className="ev-frame" />
        <line x1={CX} y1={CY} x2={tx} y2={ty} className="av-target" />
        <line x1={CX} y1={CY} x2={ex} y2={ey} className="av-arm" />
        <circle cx={gx} cy={gy} r={4} className="av-cg" />
        {arm.payloadMass > 0 && <rect x={px - 9} y={py - 9} width={18} height={18} rx={3} className="ev-payload" />}
        <circle cx={CX} cy={CY} r={7} className="ch-pivot" />
        <rect x={0} y={H - 16} width={W} height={16} className="ev-base" />
      </svg>
      <div className="ev-read">
        <span>
          角度 <b>{(th * R2D).toFixed(1)}°</b>
          {zeroOffset !== 0 && <em>（真正的角度 {(real * R2D).toFixed(1)}°）</em>}
        </span>
        <span>
          目標 <b>{(ref * R2D).toFixed(1)}°</b>
        </span>
        <span>
          重力要的電壓 <b>kG × {Math.cos(real).toFixed(2).replace(/^-0\.00$/, '0.00')}</b>
        </span>
        <span className="muted">黃色是手臂，虛線是軌跡要它在的角度，圓點是重心</span>
      </div>
    </div>
  )
}
