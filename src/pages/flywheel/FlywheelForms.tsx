import { NumberField } from '../../components/NumberField'
import { MOTOR_SPECS, type MotorId } from '../../core/motors'
import { backSurfaceRatio, GAME_PIECES_2026, HUB_2026, type FlywheelMechanism, type ShotPlan } from '../../core/flywheel/flywheel'
import { SHAPES } from './flywheelStore'

/** 射球飛輪 1F 和 3F「算轉速和仰角」共用的表單：機構、球、2026 HUB */

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function MechFields({ mech, setM }: { mech: FlywheelMechanism; setM: (p: Partial<FlywheelMechanism>) => void }) {
  return (
    <>
      <div className="fields">
        <label className="f">
          馬達
          <span className="inp">
            <select value={mech.motor} onChange={(e) => setM({ motor: e.target.value as MotorId })} aria-label="馬達">
              {Object.values(MOTOR_SPECS).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <NumberField label="馬達數量" value={mech.motorCount} onChange={(x) => setM({ motorCount: Math.round(x) })} min={1} max={4} step={1} unit="顆" />
        <NumberField label="齒比" value={mech.gearRatio} onChange={(x) => setM({ gearRatio: x })} min={0.2} max={5} step={0.05} unit=": 1" hint="馬達轉幾圈飛輪轉 1 圈；加速傳動小於 1" />
        <NumberField label="會轉的質量" value={mech.wheelMass} onChange={(x) => setM({ wheelMass: x })} min={0.05} max={10} step={0.1} unit="kg" hint="飛輪＋輪子＋軸" />
        <NumberField label="輪子半徑" value={mech.wheelRadius} display={100} digits={2} onChange={(x) => setM({ wheelRadius: x })} min={1} max={15} step={0.1} unit="cm" hint="推球的那個輪子；上下都有輪子就填大的那邊" />
        <label className="f">
          重量分布
          <span className="inp">
            <select value={mech.shape} onChange={(e) => setM({ shape: Number(e.target.value) })} aria-label="重量分布">
              {SHAPES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="f">
          球的另一邊
          <span className="inp">
            <select value={mech.back} onChange={(e) => setM({ back: e.target.value === 'rollers' ? 'rollers' : 'hood' })} aria-label="球的另一邊">
              <option value="hood">固定導板（不會轉）</option>
              <option value="rollers">對面也有滾輪，一起夾著球</option>
            </select>
          </span>
        </label>
      </div>
      {mech.back === 'rollers' && (
        <>
          <div className="fields three" style={{ marginTop: 12 }}>
            <NumberField label="對面滾輪半徑" value={mech.backRadius} display={100} digits={2} onChange={(x) => setM({ backRadius: x })} min={0.5} max={15} step={0.1} unit="cm" />
            <NumberField label="對面滾輪質量" value={mech.backMass} onChange={(x) => setM({ backMass: x })} min={0} max={5} step={0.05} unit="kg" hint="幾根加起來（滾輪＋軸）" />
            <NumberField label="對面轉速比" value={mech.backRatio} onChange={(x) => setM({ backRatio: x })} min={0.1} max={5} step={0.05} unit="倍" hint="對面滾輪轉速 ÷ 大輪轉速；同一顆馬達 1:1 帶就填 1" />
          </div>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            對面輪緣速度是大輪的 {f(backSurfaceRatio(mech), 2)} 倍。球夾在中間，球速 ≈ 0.5 ×（大輪輪緣速度 + 對面輪緣速度）；對面滾輪也會被球拖慢，所以算進轉動慣量和每一發掉的轉速。對面有好幾根的話，半徑填碰到球最後一根的。
          </p>
        </>
      )}
    </>
  )
}

/** 球的質量＋得分物件下拉選單（兩個欄位，放在 .fields 裡） */
export function BallFields({ plan, setP }: { plan: ShotPlan; setP: (p: Partial<ShotPlan>) => void }) {
  // 質量剛好是某個得分物件就顯示它，自己改過質量就變回「自己填」
  const piece = GAME_PIECES_2026.find((p) => Math.abs(p.mass - plan.ballMass) < 1e-6)?.id ?? ''
  const pickPiece = (id: string) => {
    const p = GAME_PIECES_2026.find((x) => x.id === id)
    if (p) setP({ ballMass: p.mass })
  }
  return (
    <>
      <NumberField label="球的質量" value={plan.ballMass} onChange={(x) => setP({ ballMass: x })} min={0.01} max={1} step={0.005} unit="kg" />
      <label className="f">
        得分物件
        <span className="inp">
          <select value={piece} onChange={(e) => pickPiece(e.target.value)} aria-label="得分物件">
            <option value="">自己填質量</option>
            <optgroup label="FRC 2026 REBUILT">
              {GAME_PIECES_2026.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}（{f(p.mass * 1000, 0)} g）
                </option>
              ))}
            </optgroup>
          </select>
        </span>
      </label>
    </>
  )
}

export function HubPreset({ setP }: { setP: (p: Partial<ShotPlan>) => void }) {
  return (
    <div className="fw-preset">
      <button className="btn small" type="button" onClick={() => setP(HUB_2026)}>
        套用 2026 HUB 高度
      </button>
      <span className="small muted">
        REBUILT 的 HUB：開口前緣離地 72 in（{f(HUB_2026.goalHeight, 2)} m），六角形開口寬 41.7 in（{f(HUB_2026.goalWidth, 2)} m）。目標距離照你站的位置自己填。
      </span>
    </div>
  )
}
