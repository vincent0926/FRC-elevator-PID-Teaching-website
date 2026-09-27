import type { ParameterSet } from '../../schema/parameterSet'

/**
 * 3F「照順序調」：kG → kV、kA → kP → kD。每一步從理論值出發，只打開到這一步為止的參數，
 * 讓新手看到每加一個參數圖會怎麼變。simulate 頁的「快速載入」也放在這裡。
 */

export interface TuningStep {
  title: string
  /** 這一步做什麼 */
  what: string
  /** 圖上看哪裡 */
  look: string
}

export const TUNING_STEPS: TuningStep[] = [
  {
    title: '1. 只有 kG（和 kS）',
    what: '先讓電梯「停得住」：只留重力補償 kG 和靜摩擦 kS，kV、kA、kP、kI、kD 都是 0。',
    look: '電梯停得住、不會往下掉；但也幾乎不會動：kG 剛好抵掉重力，沒有 kV、kA、kP 推它往目標走（理想模型完全不動，真實模型還會被摩擦卡住）。',
  },
  {
    title: '2. 加 kV、kA',
    what: '讓電梯「跟得上」：kV 負責等速時抵反電動勢，kA 負責加減速。',
    look: '位置圖的實線貼近虛線，跟隨誤差大幅變小；電壓圖幾乎都是綠色的前饋。',
  },
  {
    title: '3. 加 kP',
    what: '修掉剩下的誤差：前饋準了，kP 只要處理一點點誤差，不用大。',
    look: '穩態誤差接近 0；紅色回授電壓很小。如果這一步還差很多，回頭檢查 kG、kV，不要一直加 kP。',
  },
  {
    title: '4. 需要時才加 kD',
    what: '到位後還在來回擺才加 kD（這裡示範 2 V/(m/s)）。沒有振盪就不用加，kD 會放大感測雜訊。',
    look: '到位後的擺動變小。打開真實模型的感測雜訊時，看電壓是不是變得很抖。',
  },
]

/** 從理論值出發，只打開到 step（0 起算）為止的參數 */
export function tuningStepParams(theory: ParameterSet, step: number, kS: number): ParameterSet {
  const t = theory
  return {
    ...t,
    source: 'custom',
    createdAt: new Date().toISOString(),
    note: `照順序調：${TUNING_STEPS[step].title}`,
    slotByDirection: undefined,
    feedforward: { kS, kG: t.feedforward.kG, kV: step >= 1 ? t.feedforward.kV : 0, kA: step >= 1 ? t.feedforward.kA : 0 },
    feedback: { kP: step >= 2 ? t.feedback.kP : 0, kI: 0, kD: step >= 3 ? 2 : 0 },
  }
}
