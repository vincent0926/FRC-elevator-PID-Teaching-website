import { NumberField } from '../../components/NumberField'
import { NOMINAL_VOLTAGE } from '../../core/physics/simulate'
import { softLimitsOf, type PlantKnobs } from './plantKnobs'

/**
 * 真實模型的「馬達控制器」設定：控制公式算完之後，TalonFX / SPARK MAX 本身還會再套用的限制。
 * 每一項都標出機器人程式裡對應的設定，讓隊員知道模擬器裡的開關是程式裡的哪一行。
 */

const CODE = {
  talonfx: {
    stator: 'CurrentLimits.StatorCurrentLimit',
    supply: 'CurrentLimits.SupplyCurrentLimit',
    soft: 'SoftwareLimitSwitch.ForwardSoftLimitThreshold（單位是轉）',
    peak: 'Voltage.PeakForwardVoltage / PeakReverseVoltage',
    neutral: 'MotorOutput.NeutralMode',
  },
  sparkmax: {
    stator: 'smartCurrentLimit(A)',
    supply: '',
    soft: 'softLimit.forwardSoftLimit(...)（單位看 conversion factor）',
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
      <h3 style={{ margin: '0 0 6px' }}>馬達控制器</h3>
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        這些是寫在馬達控制器裡的設定（程式的 configureMotor()）。控制公式算出電壓之後，控制器還會再套用這些限制，所以「PID 想給多少」跟「馬達真的拿到多少」不一定一樣。
      </p>
      <div className="seg" role="group" aria-label="馬達控制器">
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
            <b>{spark ? 'Smart Current Limit' : 'Stator 電流限制'}</b>
          </label>
          <p className="small muted">
            限制流過馬達線圈的電流（也就是出力）。超過就降電壓，最大加速度會變小，也保護馬達不過熱。<code>{code.stator}</code>
          </p>
          {knobs.currentLimit && (
            <div className="fields">
              <NumberField label="上限" value={knobs.statorLimitA ?? statorDefault} min={5} max={200} onChange={(v) => set({ statorLimitA: v })} unit="A" hint="預設是 1F 填的值" />
            </div>
          )}
        </li>
        {!spark && (
          <li>
            <label className="check">
              <input type="checkbox" checked={knobs.supplyLimit} onChange={(e) => set({ supplyLimit: e.target.checked })} />
              <b>Supply 電流限制</b>
            </label>
            <p className="small muted">
              限制從電池拿的電流，保護斷路器和電池不掉電壓。低速時佔空比小，電池端電流比 Stator 小很多，所以通常設得比 Stator 低才會作用。<code>{code.supply}</code>
            </p>
            {knobs.supplyLimit && (
              <div className="fields">
                <NumberField label="上限（每顆）" value={knobs.supplyLimitA} min={5} max={120} onChange={(v) => set({ supplyLimitA: v })} unit="A" />
              </div>
            )}
          </li>
        )}
        {spark && (
          <li>
            <p className="small muted" style={{ margin: 0 }}>
              SPARK MAX 沒有獨立的 Supply 電流限制，只有上面的 Smart Current Limit。
            </p>
          </li>
        )}
        <li>
          <label className="check">
            <input type="checkbox" checked={knobs.softLimit} onChange={(e) => set({ softLimit: e.target.checked })} />
            <b>軟體限位（Soft Limit）</b>
          </label>
          <p className="small muted">
            位置超過限位時，那個方向的輸出直接變 neutral。控制器不會提前減速，有速度時會衝過一點；電梯停在上面要靠 kG 撐，所以目標設在限位外面會在限位附近一直抖。<code>{code.soft}</code>
          </p>
          {knobs.softLimit && (
            <div className="fields">
              <NumberField label="往上（Forward）" value={soft.forward} min={0} max={travel} step={0.01} onChange={(v) => set({ softForward: v })} unit="m" />
              <NumberField label="往下（Reverse）" value={soft.reverse} min={0} max={travel} step={0.01} onChange={(v) => set({ softReverse: v })} unit="m" />
            </div>
          )}
        </li>
        <li>
          <label className="check">
            <input type="checkbox" checked={knobs.peakOutput} onChange={(e) => set({ peakOutput: e.target.checked })} />
            <b>輸出上限（Peak Output）</b>
          </label>
          <p className="small muted">
            控制器最多輸出多少，往上往下可以不一樣。常用來限制往下衝的速度，或第一次上機時保守一點。比 kG 還小就撐不住電梯。<code>{code.peak}</code>
          </p>
          {knobs.peakOutput && (
            <div className="fields">
              {spark ? (
                <>
                  <NumberField label="往上" value={knobs.peakForward} display={100} min={0} max={100} onChange={(v) => set({ peakForward: v })} unit="%" />
                  <NumberField label="往下" value={knobs.peakReverse} display={100} min={0} max={100} onChange={(v) => set({ peakReverse: v })} unit="%" />
                </>
              ) : (
                <>
                  <NumberField label="往上" value={knobs.peakForward} display={NOMINAL_VOLTAGE} min={0} max={16} onChange={(v) => set({ peakForward: v })} unit="V" />
                  <NumberField label="往下" value={knobs.peakReverse} display={NOMINAL_VOLTAGE} min={0} max={16} onChange={(v) => set({ peakReverse: v })} unit="V" />
                </>
              )}
            </div>
          )}
        </li>
        {spark && (
          <li>
            <label className="check">
              <input type="checkbox" checked={knobs.voltageComp} onChange={(e) => set({ voltageComp: e.target.checked })} />
              <b>電壓補償（Voltage Compensation）</b>
            </label>
            <p className="small muted">
              SPARK MAX 的閉迴路輸出是佔空比（%），不是伏特。沒開電壓補償時，同樣 50% 在電池 12.5 V 和 10.5 V 給的電壓不一樣，kG 撐的力跟著變。開了之後佔空比以固定電壓換算。<code>voltageCompensation(V)</code>
            </p>
            {knobs.voltageComp && (
              <div className="fields">
                <NumberField label="補償電壓" value={knobs.voltageCompV} min={6} max={13} onChange={(v) => set({ voltageCompV: v })} unit="V" />
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
            輸出變 neutral 時（例如被軟體限位擋住）：Brake 把馬達線圈短路，反電動勢會煞住電梯；Coast 是斷路，電梯直接被重力拉下去。電梯幾乎都用 Brake。<code>{code.neutral}</code>
          </p>
        </li>
      </ul>
    </div>
  )
}
