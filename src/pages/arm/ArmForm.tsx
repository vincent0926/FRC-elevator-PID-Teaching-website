import { NumberField } from '../../components/NumberField'
import { MOTOR_SPECS, type MotorId } from '../../core/motors'
import type { ArmMechanism } from '../../schema/armParameterSet'

/** 手臂 1F 機構資料。角度在畫面上用度，內部存弧度。 */

const R2D = 180 / Math.PI
/** 角度範圍至少要這麼大，才不會上下限顛倒 */
const MIN_RANGE_DEG = 5

export function ArmForm({ m, onChange, voltsPerDeg, onVoltsPerDeg }: { m: ArmMechanism; onChange: (m: ArmMechanism) => void; voltsPerDeg: number; onVoltsPerDeg: (v: number) => void }) {
  const set = <K extends keyof ArmMechanism>(k: K, v: ArmMechanism[K]) => onChange({ ...m, [k]: v })
  return (
    <form className="panel" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="fs">
        <h3>馬達</h3>
        <div className="fields">
          <label className="f">
            馬達型號
            <span className="inp">
              <select value={m.motor} onChange={(e) => set('motor', e.target.value as MotorId)}>
                {Object.values(MOTOR_SPECS).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <NumberField label="馬達數量" value={m.motorCount} onChange={(v) => set('motorCount', Math.round(v))} unit="顆" min={1} max={4} step={1} />
          <NumberField label="Stator 電流限制（每顆）" value={m.statorCurrentLimit} onChange={(v) => set('statorCurrentLimit', v)} unit="A" min={1} max={200} />
          <NumberField label="計算用電壓" value={m.calcVoltage} onChange={(v) => set('calcVoltage', v)} unit="V" min={1} max={13} hint="考慮電池壓降，通常 10–11 V" />
          <NumberField
            label="量到的 kS（靜摩擦）"
            value={m.measuredKs ?? 0}
            onChange={(v) => set('measuredKs', v)}
            unit="V"
            min={0}
            max={6}
            step={0.01}
            hint="公式算不出來，沒量過填 0。手臂在水平時量：剛好往上轉、剛好往下轉的電壓，差的一半"
          />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>傳動</h3>
        <div className="fields">
          <NumberField label="齒比（馬達圈數 : 手臂 1 圈）" value={m.gearRatio} onChange={(v) => set('gearRatio', v)} unit=": 1" min={0.01} hint="包含齒輪箱和鏈條、皮帶的減速，全部乘起來" />
          <label className="f">
            角度感測器
            <span className="inp">
              <select value={m.encoder} onChange={(e) => set('encoder', e.target.value as ArmMechanism['encoder'])}>
                <option value="internal">TalonFX 內建編碼器（經過齒比）</option>
                <option value="cancoder">CANcoder 絕對編碼器</option>
              </select>
            </span>
          </label>
          {m.encoder === 'cancoder' && (
            <NumberField
              label="CANcoder 轉幾圈 : 手臂 1 圈"
              value={m.cancoderToArmRatio}
              onChange={(v) => set('cancoderToArmRatio', v)}
              unit=": 1"
              min={0.01}
              hint="CANcoder 直接裝在轉軸上就是 1"
            />
          )}
        </div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          {m.encoder === 'internal'
            ? '內建編碼器開機時不知道手臂在哪：開機前手臂要靠在已知角度（例如收起的硬擋），程式把位置設成那個角度。'
            : 'CANcoder 開機就知道角度。設 MagnetOffset 讓水平讀 0；Phoenix 6 用 FusedCANcoder 把它跟馬達編碼器合在一起。'}
        </p>
      </fieldset>

      <fieldset className="fs">
        <h3>手臂與負載</h3>
        <div className="fields">
          <NumberField label="手臂質量（不含負載）" value={m.armMass} onChange={(v) => set('armMass', v)} unit="kg" min={0} hint="一定要秤：包含轉軸以外會轉的所有東西" />
          <NumberField label="手臂長度（轉軸到末端）" value={m.armLength} onChange={(v) => set('armLength', v)} unit="m" min={0.01} />
          <NumberField
            label="轉軸到手臂重心"
            value={m.cgDistance}
            onChange={(v) => set('cgDistance', v)}
            unit="m"
            min={0}
            hint="均勻的桿子是長度的一半；CAD 可以直接查重心"
          />
          <NumberField label="負載質量（遊戲物件＋夾爪）" value={m.payloadMass} onChange={(v) => set('payloadMass', v)} unit="kg" min={0} />
          <NumberField label="轉軸到負載" value={m.payloadDistance} onChange={(v) => set('payloadDistance', v)} unit="m" min={0} />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>角度範圍（0° = 水平，往上為正）</h3>
        <div className="fields">
          <NumberField
            label="最小角度（收起）"
            value={m.minAngle}
            display={R2D}
            onChange={(v) => set('minAngle', v)}
            unit="°"
            min={-180}
            max={Math.round(m.maxAngle * R2D) - MIN_RANGE_DEG}
            hint={`要比最大角度小至少 ${MIN_RANGE_DEG}°`}
          />
          <NumberField
            label="最大角度"
            value={m.maxAngle}
            display={R2D}
            onChange={(v) => set('maxAngle', v)}
            unit="°"
            min={Math.round(m.minAngle * R2D) + MIN_RANGE_DEG}
            max={180}
            hint="超過 90° 就是轉過直立"
          />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>回授起始值</h3>
        <div className="fields">
          <NumberField label="誤差 1 度時要給幾伏特" value={voltsPerDeg} onChange={onVoltsPerDeg} unit="V / °" min={0} max={12} step={0.05} hint="先從 0.2–0.5 V/° 開始" />
        </div>
      </fieldset>
    </form>
  )
}
