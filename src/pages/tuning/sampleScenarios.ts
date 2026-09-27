import { round3, type IssueKey } from '../../core/analysis/diagnose'
import type { Slot0Gains } from '../../core/controller/slot0'
import type { FeedforwardResult } from '../../core/feedforward'
import type { PlantOptions } from '../../core/physics/elevator'
import type { ParameterSet } from '../../schema/parameterSet'

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
    label: '參數正確',
    lookFor: '回授輸出（P+I+D）一直很小、在 0 附近，位置緊跟目標。這是「前饋準確」的樣子。',
    expect: null,
    build: (p) => ({ gains: base(p), motionMagic: p.motionMagic }),
  },
  {
    id: 'lowKg',
    label: 'kG 少 40%',
    lookFor: '靜止保持時回授輸出一直是正的，位置停在目標下面一點。',
    expect: 'kG',
    build: (p) => ({ gains: { ...base(p), kG: p.feedforward.kG * 0.6 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'highKg',
    label: 'kG 多 30%',
    lookFor: '靜止保持時回授輸出一直是負的（在幫忙往下壓），往上往下都一樣偏。',
    expect: 'kG',
    build: (p) => ({ gains: { ...base(p), kG: p.feedforward.kG * 1.3 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'noKs',
    label: '沒設 kS',
    lookFor: '往上時回授輸出偏正、往下時偏負，大小差不多：這是摩擦（kS），不是 kG。',
    expect: 'kS',
    build: (p) => ({ gains: { ...base(p), kS: 0 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'highKv',
    label: 'kV 多 30%',
    lookFor: '等速段往上時超前、往下時落後；回授輸出在等速段有固定偏移，方向跟速度相反。',
    expect: 'kV',
    build: (p) => ({ gains: { ...base(p), kV: p.feedforward.kV * 1.3 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'lowKv',
    label: 'kV 少 25%',
    lookFor: '等速段一直落後目標，回授輸出跟速度同方向：速度越快差越多。',
    expect: 'kV',
    build: (p) => ({ gains: { ...base(p), kV: p.feedforward.kV * 0.75 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'lowKa',
    label: 'kA 只有 30%',
    lookFor: '回授輸出只在加速、減速的瞬間冒出來，等速時又回到 0。',
    expect: 'kA',
    build: (p) => ({ gains: { ...base(p), kA: p.feedforward.kA * 0.3 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'oscillation',
    label: 'kP 太大（roboRIO 50 Hz）',
    lookFor: '靜止時輸出電壓和位置一直來回抖。閉迴路放在 roboRIO 上，延遲 20 ms，kP 又太大。',
    expect: 'oscillation',
    // 20 ms 延遲下，kP 大約超過 (kA + kV·τ)/τ² 就會自己抖
    build: (p) => ({ gains: { ...base(p), kP: round3(1.1 * ((p.feedforward.kA + p.feedforward.kV * 0.02) / 0.02 ** 2)) }, motionMagic: p.motionMagic, controlPeriod: 0.02 }),
  },
  {
    id: 'lowKp',
    label: 'kP 太小',
    lookFor: '前饋都對，但這台電梯的重力隨高度變（拖鏈越拉越長），常數 kG 補不到。軌跡跑完後有時停在差 2 cm 的地方不動：誤差乘上 kP 推不動靜摩擦。',
    expect: 'kP',
    build: (p) => ({ gains: { ...base(p), kP: 2 }, motionMagic: p.motionMagic, plant: { realistic: true, kGVariation: 0.5 } }),
  },
  {
    id: 'saturate',
    label: 'Motion Magic 太快',
    lookFor: '輸出電壓貼著電池電壓、跟隨誤差很大。這是物理限制，調 PID 沒用。',
    expect: 'refused',
    build: (p, ff) => ({ gains: base(p), motionMagic: { cruiseVelocity: Math.max(0.1, ff.maxVelocity * 1.4), acceleration: p.motionMagic.acceleration * 1.5 } }),
  },
]
