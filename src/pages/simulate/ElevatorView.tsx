import type { SimResult } from '../../core/physics/simulate'
import type { ElevatorMechanism } from '../../schema/parameterSet'

/**
 * 電梯側視圖（像 WPILib Mechanism2d）：每一級畫在 x·kᵢ 的高度，
 * x 是鼓輪線位移（程式裡的位置），kᵢ 是第 i 級的速度比。
 * 固定框架和中間各級畫成一層一層套住的軌道，最後一級是托架（夾遊戲物件的地方）。
 * 同時標出「鼓輪線位移」和「最上層高度」，看得出串級式上層跑得比較快。
 * 連續式電梯實際上是一級一級依序升起，這裡用速度比平均分配，是示意圖。
 */

const W = 150
const H = 330
const BASE = 16 // 底座高度（px）
const TOP_PAD = 14
const CARRIAGE = 0.16 // 托架高度（m，畫圖用）

export function ElevatorView({ result, mechanism, goal, idx }: { result: SimResult | null; mechanism: ElevatorMechanism; goal: number; idx: number | null }) {
  const k = idx ?? (result ? result.t.length - 1 : 0)
  const x = result ? result.pos[k] : 0
  const xRef = result && idx !== null ? result.refPos[k] : goal
  const travel = mechanism.travel
  const ratios = mechanism.stages.map((s) => s.speedRatio)
  const kTop = ratios[ratios.length - 1]
  // 軌道：固定框架（k = 0）＋ 最後一級以外的每一級；最後一級是托架
  const railK = [0, ...ratios.slice(0, -1)]
  // 相鄰兩層的相對行程最大多少，軌道要夠長才套得住
  const maxGap = Math.max(...ratios.map((r, i) => r - (i === 0 ? 0 : ratios[i - 1])))
  const railLen = travel * maxGap + CARRIAGE + 0.06
  const worldH = Math.max(...railK.map((r) => travel * r + railLen), travel * kTop + CARRIAGE) + 0.04
  const scale = (H - BASE - TOP_PAD) / worldH
  const py = (h: number) => H - BASE - h * scale
  const inset = 9

  const ok = Number.isFinite(x) && Number.isFinite(xRef)
  const xs = ok ? x : 0
  const xr = ok ? xRef : 0
  const clampH = (h: number) => Math.min(worldH, Math.max(0, h))
  const inner = 8 + inset * railK.length
  const cw = Math.max(24, W - 2 * inner)

  return (
    <div className="elev-view" aria-label="電梯側視圖" role="img">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMax meet">
        {railK.map((r, i) => {
          const bottom = clampH(xs * r)
          const left = 8 + inset * i
          const y = py(bottom + railLen)
          if (i === 0) {
            // 固定架：兩根立柱加上橫桿，不會動
            return (
              <g key={i}>
                <line x1={left} y1={y} x2={left} y2={H - BASE} className="ev-frame" />
                <line x1={W - left} y1={y} x2={W - left} y2={H - BASE} className="ev-frame" />
                <line x1={left} y1={y} x2={W - left} y2={y} className="ev-frame" />
                <text x={left + 3} y={y + 10} className="ev-label">固定架</text>
              </g>
            )
          }
          return (
            <g key={i}>
              <rect x={left} y={y} width={W - 2 * left} height={railLen * scale} rx={2} className="ev-stage" />
              {/* 級的名稱靠右、往下錯開一行：靠左會跟「固定架」疊在一起（電梯在底部時兩個框的上緣同高） */}
              <text x={W - left - 3} y={y + 10 + 11 * (i - 1)} textAnchor="end" className="ev-label">
                第 {i} 級
              </text>
            </g>
          )
        })}
        <rect x={inner} y={py(clampH(xr * kTop) + CARRIAGE)} width={cw} height={CARRIAGE * scale} rx={2} className="ev-target" />
        <rect x={inner} y={py(clampH(xs * kTop) + CARRIAGE)} width={cw} height={CARRIAGE * scale} rx={2} className="ev-carriage" />
        <text x={W / 2} y={py(clampH(xs * kTop)) - 3} textAnchor="middle" className="ev-label ev-on-carriage">托架</text>
        {mechanism.payloadMass > 0 && <rect x={W / 2 - 8} y={py(clampH(xs * kTop) + CARRIAGE) - 11} width={16} height={11} rx={2} className="ev-payload" />}
        <rect x={0} y={H - BASE} width={W} height={BASE} className="ev-base" />
      </svg>
      <div className="ev-read">
        {ok ? (
          <>
            <span>
              鼓輪線位移 <b>{x.toFixed(2)} m</b>
            </span>
            <span>
              最上層高度 <b>{(x * kTop).toFixed(2)} m</b>
              {kTop !== 1 && <em>（× {kTop}）</em>}
            </span>
          </>
        ) : (
          <span className="fail">模擬數值發散，看不到位置：檢查參數（kP、kD 是不是大得不合理）</span>
        )}
        <span className="muted">固定架不動，每一級往上疊；黃色是托架，藍色虛線框是軌跡要它在的位置</span>
      </div>
    </div>
  )
}
