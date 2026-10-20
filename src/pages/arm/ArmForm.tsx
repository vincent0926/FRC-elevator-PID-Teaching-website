import { NumberField } from '../../components/NumberField'
import { MOTOR_SPECS, type MotorId } from '../../core/motors'
import type { ArmMechanism } from '../../schema/armParameterSet'
import { t } from '../../core/lang'

/** 手臂 1F 機構資料。角度在畫面上用度，內部存弧度。 */

const R2D = 180 / Math.PI
/** 角度範圍至少要這麼大，才不會上下限顛倒 */
const MIN_RANGE_DEG = 5

export function ArmForm({ m, onChange, voltsPerDeg, onVoltsPerDeg }: { m: ArmMechanism; onChange: (m: ArmMechanism) => void; voltsPerDeg: number; onVoltsPerDeg: (v: number) => void }) {
  const set = <K extends keyof ArmMechanism>(k: K, v: ArmMechanism[K]) => onChange({ ...m, [k]: v })
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
          <NumberField label={t('計算用電壓', 'Calculation voltage')} value={m.calcVoltage} onChange={(v) => set('calcVoltage', v)} unit="V" min={1} max={13} hint={t('考慮電池壓降，通常 10–11 V', 'Allowing for battery sag, usually 10–11 V')} />
          <NumberField
            label={t('量到的 kS（靜摩擦）', 'Measured kS (static friction)')}
            value={m.measuredKs ?? 0}
            onChange={(v) => set('measuredKs', v)}
            unit="V"
            min={0}
            max={6}
            step={0.01}
            hint={t('公式算不出來，沒量過填 0。手臂在水平時量：剛好往上轉、剛好往下轉的電壓，差的一半', 'Can’t be calculated; enter 0 if not measured. Measure with the arm horizontal: half the difference between the voltages that just turn it up and just turn it down')}
          />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>{t('傳動', 'Drivetrain')}</h3>
        <div className="fields">
          <NumberField label={t('齒比（馬達圈數 : 手臂 1 圈）', 'Gear ratio (motor turns : 1 arm turn)')} value={m.gearRatio} onChange={(v) => set('gearRatio', v)} unit=": 1" min={0.01} hint={t('包含齒輪箱和鏈條、皮帶的減速，全部乘起來', 'Include the gearbox and any chain or belt reduction, all multiplied together')} />
          <label className="f">
            {t('角度感測器', 'Angle sensor')}
            <span className="inp">
              <select value={m.encoder} onChange={(e) => set('encoder', e.target.value as ArmMechanism['encoder'])}>
                <option value="internal">{t('TalonFX 內建編碼器（經過齒比）', 'TalonFX built-in encoder (through the gear ratio)')}</option>
                <option value="cancoder">{t('CANcoder 絕對編碼器', 'CANcoder absolute encoder')}</option>
              </select>
            </span>
          </label>
          {m.encoder === 'cancoder' && (
            <NumberField
              label={t('CANcoder 轉幾圈 : 手臂 1 圈', 'CANcoder turns : 1 arm turn')}
              value={m.cancoderToArmRatio}
              onChange={(v) => set('cancoderToArmRatio', v)}
              unit=": 1"
              min={0.01}
              hint={t('CANcoder 直接裝在轉軸上就是 1', '1 if the CANcoder is mounted right on the pivot')}
            />
          )}
        </div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          {m.encoder === 'internal'
            ? t('內建編碼器開機時不知道手臂在哪：開機前手臂要靠在已知角度（例如收起的硬擋），程式把位置設成那個角度。', 'The built-in encoder doesn’t know where the arm is at boot: rest the arm at a known angle before booting (e.g. against the stowed hard stop), and have the code set the position to that angle.')
            : t('CANcoder 開機就知道角度。設 MagnetOffset 讓水平讀 0；Phoenix 6 用 FusedCANcoder 把它跟馬達編碼器合在一起。', 'The CANcoder knows the angle at boot. Set MagnetOffset so horizontal reads 0; Phoenix 6 combines it with the motor encoder using FusedCANcoder.')}
        </p>
      </fieldset>

      <fieldset className="fs">
        <h3>{t('手臂與負載', 'Arm and load')}</h3>
        <div className="fields">
          <NumberField label={t('手臂質量（不含負載）', 'Arm mass (without load)')} value={m.armMass} onChange={(v) => set('armMass', v)} unit="kg" min={0} hint={t('一定要秤：包含轉軸以外會轉的所有東西', 'Must be weighed: everything that rotates except the pivot shaft')} />
          <NumberField label={t('手臂長度（轉軸到末端）', 'Arm length (pivot to tip)')} value={m.armLength} onChange={(v) => set('armLength', v)} unit="m" min={0.01} />
          <NumberField
            label={t('轉軸到手臂重心', 'Pivot to arm center of mass')}
            value={m.cgDistance}
            onChange={(v) => set('cgDistance', v)}
            unit="m"
            min={0}
            hint={t('均勻的桿子是長度的一半；CAD 可以直接查重心', 'Half the length for a uniform bar; CAD can tell you the center of mass')}
          />
          <NumberField label={t('負載質量（遊戲物件＋夾爪）', 'Load mass (game piece + gripper)')} value={m.payloadMass} onChange={(v) => set('payloadMass', v)} unit="kg" min={0} />
          <NumberField label={t('轉軸到負載', 'Pivot to load')} value={m.payloadDistance} onChange={(v) => set('payloadDistance', v)} unit="m" min={0} />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>{t('角度範圍（0° = 水平，往上為正）', 'Angle range (0° = horizontal, up is positive)')}</h3>
        <div className="fields">
          <NumberField
            label={t('最小角度（收起）', 'Min angle (stowed)')}
            value={m.minAngle}
            display={R2D}
            onChange={(v) => set('minAngle', v)}
            unit="°"
            min={-180}
            max={Math.round(m.maxAngle * R2D) - MIN_RANGE_DEG}
            hint={t(`要比最大角度小至少 ${MIN_RANGE_DEG}°`, `At least ${MIN_RANGE_DEG}° below the max angle`)}
          />
          <NumberField
            label={t('最大角度', 'Max angle')}
            value={m.maxAngle}
            display={R2D}
            onChange={(v) => set('maxAngle', v)}
            unit="°"
            min={Math.round(m.minAngle * R2D) + MIN_RANGE_DEG}
            max={180}
            hint={t('超過 90° 就是轉過直立', 'Over 90° means past vertical')}
          />
        </div>
      </fieldset>

      <fieldset className="fs">
        <h3>{t('回授起始值', 'Starting feedback')}</h3>
        <div className="fields">
          <NumberField label={t('誤差 1 度時要給幾伏特', 'Volts per 1° of error')} value={voltsPerDeg} onChange={onVoltsPerDeg} unit="V / °" min={0} max={12} step={0.05} hint={t('先從 0.2–0.5 V/° 開始', 'Start at 0.2–0.5 V/°')} />
        </div>
      </fieldset>
    </form>
  )
}
