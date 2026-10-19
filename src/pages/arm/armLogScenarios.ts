import { round3, type IssueKey } from '../../core/analysis/diagnose'
import type { ArmFeedforwardResult } from '../../core/arm/feedforward'
import type { GravityType, Slot0Gains } from '../../core/controller/slot0'
import type { PlantOptions } from '../../core/physics/elevator'
import type { SimInput } from '../../core/physics/simulate'
import type { ArmParameterSet } from '../../schema/armParameterSet'
import { t } from '../../core/lang'

/**
 * 手臂 2F 練習用範例日誌的情境（模擬器故意把機器人上的參數設錯）。
 * armLogScenarios.test.ts 用同一批情境檢查診斷有沒有找到該找的問題。
 */

export interface ArmLogBuild {
  gains: Slot0Gains
  motionMagic: ArmParameterSet['motionMagic']
  plant?: PlantOptions
  controlPeriod?: number
  gravityType?: GravityType
  zeroOffset?: number
  sensor?: SimInput['sensor']
}

export interface ArmLogScenario {
  id: string
  label: string
  lookFor: string
  /** 診斷應該找到的第一優先問題；null = 沒問題；'refused' = 步驟 0 就該擋下 */
  expect: IssueKey | null | 'refused'
  build(theory: ArmParameterSet, ff: ArmFeedforwardResult): ArmLogBuild
}

/** 範例手臂的真實摩擦 0.15 V，「參數正確」就是 kS 也設 0.15 */
export const ARM_SAMPLE_FRICTION = 0.15
const base = (p: ArmParameterSet): Slot0Gains => ({ ...p.feedforward, ...p.feedback, kS: ARM_SAMPLE_FRICTION })
/** 教學用的 Motion Magic：理論上限的 40%，手臂轉得比較看得清楚 */
const mm = (p: ArmParameterSet) => ({ cruiseVelocity: p.motionMagic.cruiseVelocity * 0.4, acceleration: p.motionMagic.acceleration * 0.4 })

export const ARM_LOG_SCENARIOS: ArmLogScenario[] = [
  {
    id: 'good',
    label: t('參數正確', 'Gains correct'),
    lookFor: t('回授輸出（P+I+D）一直在 0 附近，停在水平和抬高時都一樣。這是前饋準確的樣子。', 'Feedback output (P+I+D) stays near 0, the same stopped at horizontal and raised. This is what accurate feedforward looks like.'),
    expect: null,
    build: (p) => ({ gains: base(p), motionMagic: mm(p) }),
  },
  {
    id: 'lowKg',
    label: t('kG 少 40%', 'kG 40% low'),
    lookFor: t('停在水平時回授輸出一直是正的（在幫忙往上撐）；抬到接近直立時偏差變小：差的量跟著 cos θ 變。', 'Stopped at horizontal the feedback output stays positive (helping hold it up); raised near vertical the offset shrinks: the gap follows cos θ.'),
    expect: 'kG',
    build: (p) => ({ gains: { ...base(p), kG: p.feedforward.kG * 0.6 }, motionMagic: mm(p) }),
  },
  {
    id: 'elevatorStatic',
    label: t('GravityType 設成 Elevator_Static', 'GravityType set to Elevator_Static'),
    lookFor: t('停在水平時沒事，抬高之後回授一直往下壓：常數 kG 在高角度補過頭。這不是 kG 大小的問題，是重力型態錯了，改成 Arm_Cosine。', 'Fine stopped at horizontal, but raised up the feedback keeps pushing down: a constant kG over-compensates at high angles. This isn’t kG’s size, it’s the wrong gravity type; change it to Arm_Cosine.'),
    expect: 'kG',
    build: (p) => ({ gains: base(p), motionMagic: mm(p), gravityType: 'constant' }),
  },
  {
    id: 'noKs',
    label: t('沒設 kS', 'kS not set'),
    lookFor: t('往上轉時回授偏正、往下轉時偏負，大小差不多：這是摩擦（kS），不是 kG。', 'Feedback leans positive turning up and negative turning down, by about the same amount: that’s friction (kS), not kG.'),
    expect: 'kS',
    build: (p) => ({ gains: { ...base(p), kS: 0 }, motionMagic: mm(p) }),
  },
  {
    id: 'lowKv',
    label: t('kV 少 30%', 'kV 30% low'),
    lookFor: t('等速段一直落後目標，回授輸出跟角速度同方向：轉越快差越多。', 'It keeps lagging the target in the cruise sections, and feedback is in the same direction as angular velocity: the faster, the bigger the gap.'),
    expect: 'kV',
    build: (p) => ({ gains: { ...base(p), kV: p.feedforward.kV * 0.7 }, motionMagic: mm(p) }),
  },
  {
    id: 'oscillation',
    label: t('kP 太大（roboRIO 50 Hz）', 'kP too big (roboRIO 50 Hz)'),
    lookFor: t('停住時輸出電壓和角度一直來回抖：20 ms 的延遲加上太大的 kP。', 'When stopped, output voltage and angle keep jittering back and forth: 20 ms of delay plus too big a kP.'),
    expect: 'oscillation',
    build: (p) => ({ gains: { ...base(p), kP: round3(1.1 * ((p.feedforward.kA + p.feedforward.kV * 0.02) / 0.02 ** 2)) }, motionMagic: mm(p), controlPeriod: 0.02 }),
  },
  {
    id: 'lowKp',
    label: t('手臂比算的重、kP 又小', 'Arm heavier than calculated, and a small kP'),
    lookFor: t('軌跡跑完後角度慢慢爬、停在差一點的地方，看起來像 kP 不夠。但照順序先看 kG：停在水平時回授一直偏正，真實手臂比算的重 30%。先修 kG，再看 kP 還需不需要加。', 'After the profile ends the angle slowly creeps and stops a little short, which looks like too little kP. But go in order and check kG first: stopped at horizontal the feedback stays positive, because the real arm is 30% heavier than calculated. Fix kG first, then see whether kP still needs raising.'),
    expect: 'kG',
    build: (p) => ({ gains: { ...base(p), kP: 3 }, motionMagic: mm(p), plant: { realistic: true, kGScale: 1.3 } }),
  },
  {
    id: 'saturate',
    label: t('Motion Magic 太快', 'Motion Magic too fast'),
    lookFor: t('輸出電壓貼著電池電壓、跟隨誤差很大：物理限制，調 PID 沒用。', 'Output voltage is pinned to the battery voltage and following error is large: a physical limit, and tuning PID won’t help.'),
    expect: 'refused',
    build: (p, ff) => ({ gains: base(p), motionMagic: { cruiseVelocity: Math.max(0.5, ff.maxVelocity * 1.5), acceleration: p.motionMagic.acceleration * 3 } }),
  },
]

