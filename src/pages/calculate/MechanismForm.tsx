import { NumberField } from '../../components/NumberField'
import { MOTOR_SPECS, type MotorId } from '../../core/motors'
import type { ElevatorMechanism, Stage } from '../../schema/parameterSet'

interface Props {
  m: ElevatorMechanism
  onChange: (m: ElevatorMechanism) => void
  voltsPerCm: number
  onVoltsPerCm: (v: number) => void
}

export function MechanismForm({ m, onChange, voltsPerCm, onVoltsPerCm }: Props) {
  const set = <K extends keyof ElevatorMechanism>(k: K, v: ElevatorMechanism[K]) => onChange({ ...m, [k]: v })
  const setStage = (i: number, patch: Partial<Stage>) => set('stages', m.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  const setRig = (rig: ElevatorMechanism['rig']) => {
    // 串級式第 n 級的速度比通常就是 n；連續式依繞法而定，保留使用者填的值
    onChange({ ...m, rig, stages: rig === 'cascade' ? m.stages.map((s, i) => ({ ...s, speedRatio: i + 1 })) : m.stages })
  }

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
          <NumberField
            label="計算用電壓"
            value={m.calcVoltage}
            onChange={(v) => set('calcVoltage', v)}
            unit="V"
            min={1}
            max={13}
            hint="考慮電池壓降，通常 10–11 V"
          />
          <NumberField
            label="量到的 kS（靜摩擦）"
            value={m.measuredKs ?? 0}
            onChange={(v) => set('measuredKs', v)}
            unit="V"
            min={0}
            max={6}
            step={0.01}
            hint="公式算不出來，沒量過填 0。量法看 4F「量 kS、kG（兩點法）」"
          />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>傳動</h3>
        <div className="fields">
          <NumberField label="齒比（馬達圈數 : 鼓輪 1 圈）" value={m.gearRatio} onChange={(v) => set('gearRatio', v)} unit=": 1" min={0.01} />
          <NumberField
            label="鼓輪或鏈輪節圓半徑"
            value={m.drumRadius}
            onChange={(v) => set('drumRadius', v)}
            unit="mm"
            display={1000}
            min={0.1}
            hint="鏈輪用節圓直徑的一半，不是外徑"
          />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>電梯架構</h3>
        <div className="fields" style={{ marginBottom: 12 }}>
          <label className="f">
            架構類型
            <span className="inp">
              <select value={m.rig} onChange={(e) => setRig(e.target.value as ElevatorMechanism['rig'])}>
                <option value="cascade">串級式（Cascade）</option>
                <option value="continuous">連續式（Continuous）</option>
              </select>
            </span>
          </label>
          <NumberField label="行程（鼓輪線位移）" value={m.travel} onChange={(v) => set('travel', v)} unit="m" min={0.05} max={5} />
          <NumberField label="負載質量（遊戲物件）" value={m.payloadMass} onChange={(v) => set('payloadMass', v)} unit="kg" min={0} />
          <NumberField label="配重或定力彈簧（向上）" value={m.counterweightForce} onChange={(v) => set('counterweightForce', v)} unit="N" min={0} />
        </div>
        <table className="stages">
          <thead>
            <tr>
              <th>級</th>
              <th>移動質量</th>
              <th>速度比（相對鼓輪）</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {m.stages.map((s, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <NumberField hideLabel label={`第 ${i + 1} 級質量`} value={s.mass} onChange={(v) => setStage(i, { mass: v })} unit="kg" min={0} />
                </td>
                <td>
                  <NumberField hideLabel label={`第 ${i + 1} 級速度比`} value={s.speedRatio} onChange={(v) => setStage(i, { speedRatio: v })} unit="×" min={0.01} />
                </td>
                <td>
                  {m.stages.length > 1 && (
                    <button type="button" className="btn small" aria-label={`刪除第 ${i + 1} 級`} onClick={() => set('stages', m.stages.filter((_, j) => j !== i))}>
                      刪除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 8 }}>
          {m.stages.length < 5 && (
            <button
              type="button"
              className="btn small"
              onClick={() => set('stages', [...m.stages, { mass: 3, speedRatio: m.rig === 'cascade' ? m.stages.length + 1 : 1 }])}
            >
              新增一級
            </button>
          )}
          <span className="muted small">
            {m.rig === 'cascade' ? '串級式第 n 級的速度比通常是 n。' : '連續式各級速度比依繞繩方式而定，請對照實際機構確認。'}
            質量填「這一級自己」會動的部分，不含下面的級。
          </span>
        </div>
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={m.controlTop} onChange={(e) => set('controlTop', e.target.checked)} />
          程式裡的位置用「最上層高度」（不勾選則為鼓輪線位移，也就是第一級）
        </label>
      </fieldset>

      <fieldset className="fs">
        <h3>PID 起始值（入門版）</h3>
        <div className="fields">
          <NumberField label="誤差 1 公分時要給幾伏特" value={voltsPerCm} onChange={onVoltsPerCm} unit="V / cm" min={0} max={12} step={0.05} />
        </div>
      </fieldset>
    </form>
  )
}
