import { NumberField } from '../../components/NumberField'
import { NOMINAL_VOLTAGE } from '../../core/physics/simulate'
import { softLimitsOf, type PlantKnobs } from './plantKnobs'
import { t } from '../../core/lang'

/**
 * 真實模型的「馬達控制器」設定：控制公式算完之後，TalonFX / SPARK MAX 本身還會再套用的限制。
 * 每一項都標出機器人程式裡對應的設定，讓隊員知道模擬器裡的開關是程式裡的哪一行。
 */

const CODE = {
  talonfx: {
    stator: 'CurrentLimits.StatorCurrentLimit',
    supply: 'CurrentLimits.SupplyCurrentLimit',
    soft: t('SoftwareLimitSwitch.ForwardSoftLimitThreshold（單位是轉）', 'SoftwareLimitSwitch.ForwardSoftLimitThreshold (in rotations)'),
    peak: 'Voltage.PeakForwardVoltage / PeakReverseVoltage',
    neutral: 'MotorOutput.NeutralMode',
  },
  sparkmax: {
    stator: 'smartCurrentLimit(A)',
    supply: '',
    soft: t('softLimit.forwardSoftLimit(...)（單位看 conversion factor）', 'softLimit.forwardSoftLimit(...) (units follow the conversion factor)'),
    peak: 'closedLoop.outputRange(min, max)',
    neutral: 'idleMode(IdleMode.kBrake)',
  },
} as const

export function ControllerSettings({
  knobs,
  set,
  statorDefault,
  travel,
}: {
  knobs: PlantKnobs
  set: (patch: Partial<PlantKnobs>) => void
  /** 1F 機構資料的 Stator 電流限制 */
  statorDefault: number
  travel: number
}) {
  const spark = knobs.controllerType === 'sparkmax'
  const code = CODE[knobs.controllerType]
  const soft = softLimitsOf(knobs, travel)
  return (
    <div className="ctrl">
      <h3 style={{ margin: '0 0 6px' }}>{t('馬達控制器', 'Motor controller')}</h3>
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        {t(
          <>
          這些是寫在馬達控制器裡的設定（程式的 configureMotor()）。控制公式算出電壓之後，控制器還會再套用這些限制，所以「PID 想給多少」跟「馬達真的拿到多少」不一定一樣。
          </>,
          <>
            These are settings stored in the motor controller (configureMotor() in code). After the control law computes a voltage, the controller applies these limits on top, so “what PID wants” and “what the motor actually gets” aren’t always the same.
          </>,
        )}
      </p>
      <div className="seg" role="group" aria-label={t('馬達控制器', 'Motor controller')}>
        <button type="button" aria-pressed={!spark} onClick={() => set({ controllerType: 'talonfx' })}>
          TalonFX（Phoenix 6）
        </button>
        <button type="button" aria-pressed={spark} onClick={() => set({ controllerType: 'sparkmax' })}>
          SPARK MAX（REVLib）
        </button>
      </div>

      <ul className="toggles" style={{ marginTop: 8 }}>
        <li>
          <label className="check">
            <input type="checkbox" checked={knobs.currentLimit} onChange={(e) => set({ currentLimit: e.target.checked })} />
            <b>{spark ? 'Smart Current Limit' : t('Stator 電流限制', 'Stator current limit')}</b>
          </label>
          <p className="small muted">
            {t('限制流過馬達線圈的電流（也就是出力）。超過就降電壓，最大加速度會變小，也保護馬達不過熱。', 'Limits the current through the motor windings (i.e. its effort). Above it the voltage is lowered, so max acceleration drops, and it keeps the motor from overheating. ')}
            <code>{code.stator}</code>
          </p>
          {knobs.currentLimit && (
            <div className="fields">
              <NumberField label={t('上限', 'Limit')} value={knobs.statorLimitA ?? statorDefault} min={5} max={200} onChange={(v) => set({ statorLimitA: v })} unit="A" hint={t('預設是 1F 填的值', 'Defaults to the value from 1F')} />
            </div>
          )}
        </li>
        {!spark && (
          <li>
            <label className="check">
              <input type="checkbox" checked={knobs.supplyLimit} onChange={(e) => set({ supplyLimit: e.target.checked })} />
              <b>{t('Supply 電流限制', 'Supply current limit')}</b>
            </label>
            <p className="small muted">
              {t('限制從電池拿的電流，保護斷路器和電池不掉電壓。低速時佔空比小，電池端電流比 Stator 小很多，所以通常設得比 Stator 低才會作用。', 'Limits the current drawn from the battery, protecting the breaker and keeping the battery voltage up. At low speed the duty cycle is small and battery-side current is much less than stator current, so it usually only kicks in when set lower than the stator limit. ')}
              <code>{code.supply}</code>
            </p>
            {knobs.supplyLimit && (
              <div className="fields">
                <NumberField label={t('上限（每顆）', 'Limit (per motor)')} value={knobs.supplyLimitA} min={5} max={120} onChange={(v) => set({ supplyLimitA: v })} unit="A" />
              </div>
            )}
          </li>
        )}
        {spark && (
          <li>
            <p className="small muted" style={{ margin: 0 }}>
              {t(
                <>
                SPARK MAX 沒有獨立的 Supply 電流限制，只有上面的 Smart Current Limit。
                </>,
                <>
                  SPARK MAX has no separate supply current limit, only the Smart Current Limit above.
                </>,
              )}
            </p>
          </li>
        )}
        <li>
          <label className="check">
            <input type="checkbox" checked={knobs.softLimit} onChange={(e) => set({ softLimit: e.target.checked })} />
            <b>{t('軟體限位（Soft Limit）', 'Soft limit')}</b>
          </label>
          <p className="small muted">
            {t('位置超過限位時，那個方向的輸出直接變 neutral。控制器不會提前減速，有速度時會衝過一點；電梯停在上面要靠 kG 撐，所以目標設在限位外面會在限位附近一直抖。', 'Past the limit, output in that direction goes straight to neutral. The controller doesn’t slow down early, so it overshoots a little if moving; holding the elevator up needs kG, so a target beyond the limit makes it jitter around the limit. ')}
            <code>{code.soft}</code>
          </p>
          {knobs.softLimit && (
            <div className="fields">
              <NumberField label={t('往上（Forward）', 'Up (Forward)')} value={soft.forward} min={0} max={travel} step={0.01} onChange={(v) => set({ softForward: v })} unit="m" />
              <NumberField label={t('往下（Reverse）', 'Down (Reverse)')} value={soft.reverse} min={0} max={travel} step={0.01} onChange={(v) => set({ softReverse: v })} unit="m" />
            </div>
          )}
        </li>
        <li>
          <label className="check">
            <input type="checkbox" checked={knobs.peakOutput} onChange={(e) => set({ peakOutput: e.target.checked })} />
            <b>{t('輸出上限（Peak Output）', 'Peak output')}</b>
          </label>
          <p className="small muted">
            {t('控制器最多輸出多少，往上往下可以不一樣。常用來限制往下衝的速度，或第一次上機時保守一點。比 kG 還小就撐不住電梯。', 'The most the controller will output, which can differ up and down. Often used to limit how fast it drops, or to be conservative the first time on the robot. Below kG it can’t hold the elevator up. ')}
            <code>{code.peak}</code>
          </p>
          {knobs.peakOutput && (
            <div className="fields">
              {spark ? (
                <>
                  <NumberField label={t('往上', 'Up')} value={knobs.peakForward} display={100} min={0} max={100} onChange={(v) => set({ peakForward: v })} unit="%" />
                  <NumberField label={t('往下', 'Down')} value={knobs.peakReverse} display={100} min={0} max={100} onChange={(v) => set({ peakReverse: v })} unit="%" />
                </>
              ) : (
                <>
                  <NumberField label={t('往上', 'Up')} value={knobs.peakForward} display={NOMINAL_VOLTAGE} min={0} max={16} onChange={(v) => set({ peakForward: v })} unit="V" />
                  <NumberField label={t('往下', 'Down')} value={knobs.peakReverse} display={NOMINAL_VOLTAGE} min={0} max={16} onChange={(v) => set({ peakReverse: v })} unit="V" />
                </>
              )}
            </div>
          )}
        </li>
        {spark && (
          <li>
            <label className="check">
              <input type="checkbox" checked={knobs.voltageComp} onChange={(e) => set({ voltageComp: e.target.checked })} />
              <b>{t('電壓補償（Voltage Compensation）', 'Voltage compensation')}</b>
            </label>
            <p className="small muted">
              {t('SPARK MAX 的閉迴路輸出是佔空比（%），不是伏特。沒開電壓補償時，同樣 50% 在電池 12.5 V 和 10.5 V 給的電壓不一樣，kG 撐的力跟著變。開了之後佔空比以固定電壓換算。', 'SPARK MAX closed-loop output is duty cycle (%), not volts. Without voltage compensation, the same 50% gives different voltages at 12.5 V and 10.5 V battery, so the force kG holds changes too. With it on, duty cycle is scaled against a fixed voltage. ')}
              <code>voltageCompensation(V)</code>
            </p>
            {knobs.voltageComp && (
              <div className="fields">
                <NumberField label={t('補償電壓', 'Compensation voltage')} value={knobs.voltageCompV} min={6} max={13} onChange={(v) => set({ voltageCompV: v })} unit="V" />
              </div>
            )}
          </li>
        )}
        <li>
          <b className="small">Neutral Mode</b>
          <div className="seg" role="group" aria-label="Neutral Mode" style={{ marginLeft: 12 }}>
            <button type="button" aria-pressed={knobs.neutralMode === 'brake'} onClick={() => set({ neutralMode: 'brake' })}>
              Brake
            </button>
            <button type="button" aria-pressed={knobs.neutralMode === 'coast'} onClick={() => set({ neutralMode: 'coast' })}>
              Coast
            </button>
          </div>
          <p className="small muted">
            {t('輸出變 neutral 時（例如被軟體限位擋住）：Brake 把馬達線圈短路，反電動勢會煞住電梯；Coast 是斷路，電梯直接被重力拉下去。電梯幾乎都用 Brake。', 'When output goes neutral (e.g. blocked by a soft limit): Brake shorts the motor windings so back-EMF brakes the elevator; Coast leaves them open and gravity pulls the elevator straight down. Elevators almost always use Brake. ')}
            <code>{code.neutral}</code>
          </p>
        </li>
      </ul>
    </div>
  )
}
