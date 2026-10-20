import { round3, type IssueKey } from '../../core/analysis/diagnose'
import type { Slot0Gains } from '../../core/controller/slot0'
import type { FeedforwardResult } from '../../core/feedforward'
import type { PlantOptions } from '../../core/physics/elevator'
import type { SimInput } from '../../core/physics/simulate'
import type { ParameterSet } from '../../schema/parameterSet'
import { t } from '../../core/lang'

/**
 * 練習用範例日誌的情境：用模擬器故意把機器人上的參數設錯。
 * 診斷規則也用同一批情境驗證正確率（sampleScenarios.test.ts、core/analysis/diagnose.test.ts）。
 */

export interface ScenarioBuild {
  gains: Slot0Gains
  motionMagic: ParameterSet['motionMagic']
  /** 真實機構跟理論值的差別（預設：真實模型、摩擦 0.15 V） */
  plant?: PlantOptions
  /** 閉迴路週期，預設 TalonFX 1 ms */
  controlPeriod?: number
  /** 控制器看到的感測延遲與雜訊 */
  sensor?: SimInput['sensor']
}

export interface Scenario {
  id: string
  label: string
  /** 給隊員看的提示：這份日誌裡該看到什麼 */
  lookFor: string
  /** 診斷應該找到的第一優先問題；null = 沒問題；'refused' = 步驟 0 就該擋下 */
  expect: IssueKey | null | 'refused'
  build(theory: ParameterSet, ff: FeedforwardResult): ScenarioBuild
}

/** 範例機器人的真實摩擦是 0.15 V，「參數正確」就是 kS 也設 0.15 */
export const SAMPLE_FRICTION = 0.15
const base = (p: ParameterSet): Slot0Gains => ({ ...p.feedforward, ...p.feedback, kS: SAMPLE_FRICTION })

export const SCENARIOS: Scenario[] = [
  {
    id: 'good',
    label: t('參數正確', 'Gains correct'),
    lookFor: t('回授輸出（P+I+D）一直很小、在 0 附近，位置緊跟目標。這是「前饋準確」的樣子。', 'Feedback output (P+I+D) stays small, near 0, and the position tracks the target closely. This is what “accurate feedforward” looks like.'),
    expect: null,
    build: (p) => ({ gains: base(p), motionMagic: p.motionMagic }),
  },
  {
    id: 'lowKg',
    label: t('kG 少 40%', 'kG 40% low'),
    lookFor: t('靜止保持時回授輸出一直是正的，位置停在目標下面一點。', 'While holding still the feedback output stays positive and the position sits a little below the target.'),
    expect: 'kG',
    build: (p) => ({ gains: { ...base(p), kG: p.feedforward.kG * 0.6 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'highKg',
    label: t('kG 多 30%', 'kG 30% high'),
    lookFor: t('靜止保持時回授輸出一直是負的（在幫忙往下壓），往上往下都一樣偏。', 'While holding still the feedback output stays negative (helping push down), and it’s off the same way going up and down.'),
    expect: 'kG',
    build: (p) => ({ gains: { ...base(p), kG: p.feedforward.kG * 1.3 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'noKs',
    label: t('沒設 kS', 'kS not set'),
    lookFor: t('往上時回授輸出偏正、往下時偏負，大小差不多：這是摩擦（kS），不是 kG。', 'Feedback output leans positive going up and negative going down, by about the same amount: that’s friction (kS), not kG.'),
    expect: 'kS',
    build: (p) => ({ gains: { ...base(p), kS: 0 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'highKv',
    label: t('kV 多 30%', 'kV 30% high'),
    lookFor: t('等速段往上時超前、往下時落後；回授輸出在等速段有固定偏移，方向跟速度相反。', 'In the constant-velocity sections it runs ahead going up and lags going down; feedback has a steady offset there, opposite to the velocity.'),
    expect: 'kV',
    build: (p) => ({ gains: { ...base(p), kV: p.feedforward.kV * 1.3 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'lowKv',
    label: t('kV 少 25%', 'kV 25% low'),
    lookFor: t('等速段一直落後目標，回授輸出跟速度同方向：速度越快差越多。', 'It keeps lagging the target in the constant-velocity sections, and feedback is in the same direction as the velocity: the faster, the bigger the gap.'),
    expect: 'kV',
    build: (p) => ({ gains: { ...base(p), kV: p.feedforward.kV * 0.75 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'lowKa',
    label: t('kA 只有 30%', 'kA only 30%'),
    lookFor: t('回授輸出只在加速、減速的瞬間冒出來，等速時又回到 0。', 'Feedback output only pops up at the moments of acceleration and deceleration, then returns to 0 at constant velocity.'),
    expect: 'kA',
    build: (p) => ({ gains: { ...base(p), kA: p.feedforward.kA * 0.3 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'oscillation',
    label: t('kP 太大（roboRIO 50 Hz）', 'kP too big (roboRIO 50 Hz)'),
    lookFor: t('靜止時輸出電壓和位置一直來回抖。閉迴路放在 roboRIO 上，延遲 20 ms，kP 又太大。', 'At rest the output voltage and position keep jittering back and forth. The closed loop runs on the roboRIO with 20 ms of delay, and kP is too big.'),
    expect: 'oscillation',
    // 20 ms 延遲下，kP 大約超過 (kA + kV·τ)/τ² 就會自己抖
    build: (p) => ({ gains: { ...base(p), kP: round3(1.1 * ((p.feedforward.kA + p.feedforward.kV * 0.02) / 0.02 ** 2)) }, motionMagic: p.motionMagic, controlPeriod: 0.02 }),
  },
  {
    id: 'lowKp',
    label: t('kP 太小', 'kP too small'),
    lookFor: t('前饋都對，但這台電梯的重力隨高度變（拖鏈越拉越長），常數 kG 補不到。軌跡跑完後有時停在差 2 cm 的地方不動：誤差乘上 kP 推不動靜摩擦。', 'Feedforward is all right, but this elevator’s gravity changes with height (the drag chain gets longer), so a constant kG can’t cover it. After the profile ends it sometimes stops 2 cm short: error × kP can’t overcome static friction.'),
    expect: 'kP',
    build: (p) => ({ gains: { ...base(p), kP: 2 }, motionMagic: p.motionMagic, plant: { realistic: true, kGVariation: 0.5 } }),
  },
  {
    id: 'noisyKd',
    label: t('kD 太大（放大雜訊）', 'kD too big (amplifies noise)'),
    lookFor: t('到位後輸出電壓一直抖，但位置幾乎沒動：不是振盪，是 kD 把速度的雜訊放大了。這時要降 kD，不是降 kP。', 'After arriving the output voltage keeps jittering but the position barely moves: it’s not oscillation, kD is amplifying velocity noise. Lower kD, not kP.'),
    expect: 'oscillation',
    build: (p) => ({ gains: { ...base(p), kD: 40 }, motionMagic: p.motionMagic, sensor: { delay: 0.002, positionNoise: 0.001, velocityNoise: 0.02 } }),
  },
  {
    id: 'asymFriction',
    label: t('摩擦往上往下不一樣', 'Friction differs up and down'),
    lookFor: t('往上摩擦 0.35 V、往下 0.05 V，kS 設平均 0.2 V。診斷會說 kG 不對：kG 補上不對稱的一半之後，剛好在靜摩擦範圍正中間，不需要多用 Slot 1。', 'Friction is 0.35 V up and 0.05 V down, with kS set to the 0.2 V average. The diagnosis says kG is off: with kG covering half the asymmetry it sits right in the middle of the static friction band, so Slot 1 isn’t needed.'),
    expect: 'kG',
    build: (p) => ({ gains: { ...base(p), kS: 0.2 }, motionMagic: { cruiseVelocity: p.motionMagic.cruiseVelocity * 0.8, acceleration: p.motionMagic.acceleration * 0.8 }, plant: { realistic: true, frictionKs: 0.35, frictionKsDown: 0.05 } }),
  },
  {
    id: 'saturate',
    label: t('Motion Magic 太快', 'Motion Magic too fast'),
    lookFor: t('輸出電壓貼著電池電壓、跟隨誤差很大。這是物理限制，調 PID 沒用。', 'Output voltage is pinned to the battery voltage and the following error is large. This is a physical limit; tuning PID won’t help.'),
    expect: 'refused',
    build: (p, ff) => ({ gains: base(p), motionMagic: { cruiseVelocity: Math.max(0.1, ff.maxVelocity * 1.4), acceleration: p.motionMagic.acceleration * 1.5 } }),
  },
]
