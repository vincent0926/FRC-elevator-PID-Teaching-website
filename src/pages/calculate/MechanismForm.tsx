import { NumberField } from '../../components/NumberField'
import { MOTOR_SPECS, type MotorId } from '../../core/motors'
import type { ElevatorMechanism, Stage } from '../../schema/parameterSet'
import { t } from '../../core/lang'

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
        <h3>{t('馬達', 'Motor')}</h3>
        <div className="fields">
          <label className="f">
            {t('馬達型號', 'Motor model')}
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
          <NumberField label={t('馬達數量', 'Motor count')} value={m.motorCount} onChange={(v) => set('motorCount', Math.round(v))} unit={t('顆', 'motors')} min={1} max={4} step={1} />
          <NumberField label={t('Stator 電流限制（每顆）', 'Stator current limit (per motor)')} value={m.statorCurrentLimit} onChange={(v) => set('statorCurrentLimit', v)} unit="A" min={1} max={200} />
          <NumberField
            label={t('計算用電壓', 'Calculation voltage')}
            value={m.calcVoltage}
            onChange={(v) => set('calcVoltage', v)}
            unit="V"
            min={1}
            max={13}
            hint={t('考慮電池壓降，通常 10–11 V', 'Allowing for battery sag, usually 10–11 V')}
          />
          <NumberField
            label={t('量到的 kS（靜摩擦）', 'Measured kS (static friction)')}
            value={m.measuredKs ?? 0}
            onChange={(v) => set('measuredKs', v)}
            unit="V"
            min={0}
            max={6}
            step={0.01}
            hint={t('公式算不出來，沒量過填 0。量法看 4F「量 kS、kG（兩點法）」', 'Can’t be calculated; enter 0 if you haven’t measured it. See “Measure kS, kG (two-point method)” in 4F')}
          />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>{t('傳動', 'Drivetrain')}</h3>
        <div className="fields">
          <NumberField label={t('齒比（馬達圈數 : 鼓輪 1 圈）', 'Gear ratio (motor turns : 1 drum turn)')} value={m.gearRatio} onChange={(v) => set('gearRatio', v)} unit=": 1" min={0.01} />
          <NumberField
            label={t('鼓輪或鏈輪節圓半徑', 'Drum or sprocket pitch radius')}
            value={m.drumRadius}
            onChange={(v) => set('drumRadius', v)}
            unit="mm"
            display={1000}
            min={0.1}
            hint={t('鏈輪用節圓直徑的一半，不是外徑', 'For sprockets use half the pitch diameter, not the outer diameter')}
          />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>{t('電梯架構', 'Elevator layout')}</h3>
        <div className="fields" style={{ marginBottom: 12 }}>
          <label className="f">
            {t('架構類型', 'Rigging')}
            <span className="inp">
              <select value={m.rig} onChange={(e) => setRig(e.target.value as ElevatorMechanism['rig'])}>
                <option value="cascade">{t('串級式（Cascade）', 'Cascade')}</option>
                <option value="continuous">{t('連續式（Continuous）', 'Continuous')}</option>
              </select>
            </span>
          </label>
          <NumberField label={t('行程（鼓輪線位移）', 'Travel (drum rope displacement)')} value={m.travel} onChange={(v) => set('travel', v)} unit="m" min={0.05} max={5} />
          <NumberField label={t('負載質量（遊戲物件）', 'Payload mass (game piece)')} value={m.payloadMass} onChange={(v) => set('payloadMass', v)} unit="kg" min={0} />
          <NumberField label={t('配重或定力彈簧（向上）', 'Counterweight or constant-force spring (up)')} value={m.counterweightForce} onChange={(v) => set('counterweightForce', v)} unit="N" min={0} />
        </div>
        <table className="stages">
          <thead>
            <tr>
              <th>{t('級', 'Stage')}</th>
              <th>{t('移動質量', 'Moving mass')}</th>
              <th>{t('速度比（相對鼓輪）', 'Speed ratio (vs. drum)')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {m.stages.map((s, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <NumberField hideLabel label={t(`第 ${i + 1} 級質量`, `Stage ${i + 1} mass`)} value={s.mass} onChange={(v) => setStage(i, { mass: v })} unit="kg" min={0} />
                </td>
                <td>
                  <NumberField hideLabel label={t(`第 ${i + 1} 級速度比`, `Stage ${i + 1} speed ratio`)} value={s.speedRatio} onChange={(v) => setStage(i, { speedRatio: v })} unit="×" min={0.01} />
                </td>
                <td>
                  {m.stages.length > 1 && (
                    <button type="button" className="btn small" aria-label={t(`刪除第 ${i + 1} 級`, `Delete stage ${i + 1}`)} onClick={() => set('stages', m.stages.filter((_, j) => j !== i))}>
                      {t('刪除', 'Delete')}
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
              {t('新增一級', 'Add a stage')}
            </button>
          )}
          <span className="muted small">
            {m.rig === 'cascade' ? t('串級式第 n 級的速度比通常是 n。', 'In a cascade, stage n usually has speed ratio n. ') : t('連續式各級速度比依繞繩方式而定，請對照實際機構確認。', 'In a continuous rig the speed ratios depend on the rigging; check against the real mechanism. ')}
            {t('質量填「這一級自己」會動的部分，不含下面的級。', 'For mass, enter only what moves with this stage itself, not the stages below it.')}
          </span>
        </div>
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={m.controlTop} onChange={(e) => set('controlTop', e.target.checked)} />
          {t(
            <>
            程式裡的位置用「最上層高度」（不勾選則為鼓輪線位移，也就是第一級）
            </>,
            <>
              Position in code is the “top stage height” (unchecked: drum rope displacement, i.e. the first stage)
            </>,
          )}
        </label>
      </fieldset>

      <fieldset className="fs">
        <h3>{t('PID 起始值（入門版）', 'Starting PID (beginner)')}</h3>
        <div className="fields">
          <NumberField label={t('誤差 1 公分時要給幾伏特', 'Volts per 1 cm of error')} value={voltsPerCm} onChange={onVoltsPerCm} unit="V / cm" min={0} max={12} step={0.05} />
        </div>
      </fieldset>
    </form>
  )
}
