import type { Slot0Gains } from '../../core/controller/slot0'
import type { FeedforwardResult } from '../../core/feedforward'
import type { ParameterSet } from '../../schema/parameterSet'

/**
 * 練習用範例日誌的情境：用模擬器故意把機器人上的參數設錯。
 * Phase 2 的診斷規則也會用同一批情境驗證正確率。
 */

export interface Scenario {
  id: string
  label: string
  /** 給隊員看的提示：這份日誌裡該看到什麼 */
  lookFor: string
  build(theory: ParameterSet, ff: FeedforwardResult): { gains: Slot0Gains; motionMagic: ParameterSet['motionMagic'] }
}

const base = (p: ParameterSet): Slot0Gains => ({ ...p.feedforward, ...p.feedback, kS: 0.15 })

export const SCENARIOS: Scenario[] = [
  {
    id: 'good',
    label: '參數正確',
    lookFor: '回授輸出（P+I+D）一直很小、在 0 附近，位置緊跟目標。這是「前饋準確」的樣子。',
    build: (p) => ({ gains: base(p), motionMagic: p.motionMagic }),
  },
  {
    id: 'lowKg',
    label: 'kG 少 40%',
    lookFor: '靜止保持時回授輸出一直是正的，位置停在目標下面一點。',
    build: (p) => ({ gains: { ...base(p), kG: p.feedforward.kG * 0.6 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'highKv',
    label: 'kV 多 30%',
    lookFor: '等速段往上時超前、往下時落後；回授輸出在等速段有固定偏移，方向跟速度相反。',
    build: (p) => ({ gains: { ...base(p), kV: p.feedforward.kV * 1.3 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'noKs',
    label: '沒設 kS',
    lookFor: '往上時回授輸出偏正、往下時偏負，大小差不多：這是摩擦（kS），不是 kG。',
    build: (p) => ({ gains: { ...base(p), kS: 0 }, motionMagic: p.motionMagic }),
  },
  {
    id: 'saturate',
    label: 'Motion Magic 太快',
    lookFor: '輸出電壓貼著電池電壓、跟隨誤差很大。這是物理限制，調 PID 沒用。',
    build: (p, ff) => ({ gains: base(p), motionMagic: { cruiseVelocity: Math.max(0.1, ff.maxVelocity * 1.4), acceleration: p.motionMagic.acceleration * 1.5 } }),
  },
]
