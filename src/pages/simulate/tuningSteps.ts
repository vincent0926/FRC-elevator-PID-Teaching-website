import type { ParameterSet } from '../../schema/parameterSet'
import { t } from '../../core/lang'

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
    title: t('1. 只有 kG（和 kS）', '1. kG only (and kS)'),
    what: t('先讓機構「停得住」：只留重力補償 kG 和靜摩擦 kS，kV、kA、kP、kI、kD 都是 0。', 'First make the mechanism “stay put”: keep only gravity compensation kG and static friction kS; kV, kA, kP, kI and kD are all 0.'),
    look: t('停得住、不會往下掉；但也幾乎不會動：kG 剛好抵掉重力，沒有 kV、kA、kP 推它往目標走（理想模型完全不動，真實模型還會被摩擦卡住）。', 'It holds and doesn’t sag, but it barely moves: kG just cancels gravity, and there’s no kV, kA or kP pushing it toward the target (the ideal model doesn’t move at all; the realistic model also gets stuck on friction).'),
  },
  {
    title: t('2. 加 kV、kA', '2. Add kV, kA'),
    what: t('讓機構「跟得上」：kV 負責等速時抵反電動勢，kA 負責加減速。', 'Make the mechanism “keep up”: kV cancels back-EMF at constant speed, kA handles acceleration and deceleration.'),
    look: t('位置圖的實線貼近虛線，跟隨誤差大幅變小；電壓圖幾乎都是綠色的前饋。', 'The solid line in the position chart hugs the dashed line and following error drops a lot; the voltage chart is almost all green feedforward.'),
  },
  {
    title: t('3. 加 kP', '3. Add kP'),
    what: t('修掉剩下的誤差：前饋準了，kP 只要處理一點點誤差，不用大。', 'Clean up the remaining error: with accurate feedforward, kP only handles a little error and doesn’t need to be big.'),
    look: t('穩態誤差接近 0；紅色回授電壓很小。如果這一步還差很多，回頭檢查 kG、kV，不要一直加 kP。', 'Steady-state error is near 0 and the red feedback voltage is small. If it’s still far off at this step, go back and check kG and kV instead of piling on kP.'),
  },
  {
    title: t('4. 需要時才加 kD', '4. Add kD only if needed'),
    what: t('到位後還在來回擺才加 kD（這裡示範一個小的 kD）。沒有振盪就不用加，kD 會放大感測雜訊。', 'Add kD only if it still swings back and forth after arriving (a small kD is demonstrated here). Without oscillation, skip it: kD amplifies sensor noise.'),
    look: t('到位後的擺動變小。打開真實模型的感測雜訊時，看電壓是不是變得很抖。', 'The swing after arrival gets smaller. With sensor noise on in the realistic model, check whether the voltage gets very jittery.'),
  },
]

/** 從理論值出發，只打開到 step（0 起算）為止的參數。電梯、手臂共用：只動前饋和回授，其他欄位照抄；kD 示範值電梯 2 V/(m/s)、手臂傳 kDDemo */
export function tuningStepParams<T extends Pick<ParameterSet, 'feedforward' | 'feedback' | 'source' | 'createdAt' | 'note'>>(theory: T, step: number, kS: number, kDDemo = 2): T {
  const th = theory
  const out: T = {
    ...th,
    source: 'custom',
    createdAt: new Date().toISOString(),
    note: t(`照順序調：${TUNING_STEPS[step].title}`, `Tuning in order: ${TUNING_STEPS[step].title}`),
    feedforward: { kS, kG: th.feedforward.kG, kV: step >= 1 ? th.feedforward.kV : 0, kA: step >= 1 ? th.feedforward.kA : 0 },
    feedback: { kP: step >= 2 ? th.feedback.kP : 0, kI: 0, kD: step >= 3 ? kDDemo : 0 },
  }
  // 電梯的往下 Slot 1 會蓋掉 kS、kG，照順序調時拿掉
  if ('slotByDirection' in out) (out as { slotByDirection?: unknown }).slotByDirection = undefined
  return out
}
