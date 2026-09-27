/**
 * 3F 挑戰模式（步驟 8）：系統隨機產生一台「看不到參數」的電梯，
 * 隊員在有限次數內調整自訂參數，讓兩次移動都達標。
 *
 * 隱藏的是真實機構跟理論值的差（倍率與摩擦），跟真的上機一樣：你只知道 1F 算的理論值，
 * 要從模擬出來的圖判斷哪裡不對。
 */

export type ChallengeLevel = 'easy' | 'hard'

export interface HiddenPlant {
  kGScale: number
  kVScale: number
  kAScale: number
  frictionUp: number
  frictionDown: number
}

export const CHALLENGE_ATTEMPTS: Record<ChallengeLevel, number> = { easy: 10, hard: 8 }

export const LEVEL_LABEL: Record<ChallengeLevel, string> = {
  easy: '入門：只有重量和摩擦跟理論不一樣',
  hard: '進階：重量、慣性、kV、摩擦（往上往下不同）都可能不一樣',
}

function uniformRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function candidate(rand: () => number, level: ChallengeLevel): HiddenPlant {
  const lerp = (a: number, b: number) => a + (b - a) * rand()
  // 重量差很多（像是質量填錯、多了遊戲物件），不然理論值直接就過了
  const kGScale = rand() < 0.6 ? lerp(1.3, 1.9) : lerp(0.4, 0.7)
  if (level === 'easy') {
    const f = lerp(0.1, 0.4)
    return { kGScale, kVScale: 1, kAScale: 1, frictionUp: f, frictionDown: f }
  }
  return {
    kGScale,
    kVScale: lerp(0.75, 1.3),
    kAScale: lerp(0.7, 2),
    frictionUp: lerp(0.15, 0.5),
    frictionDown: lerp(0.05, 0.25),
  }
}

/**
 * @param reject 回傳 true 表示這台不適合出題（理論值就達標、或參考解答也過不了），會換一台（最多試 30 次）
 */
export function makeChallenge(seed: number, level: ChallengeLevel, reject: (h: HiddenPlant) => boolean = () => false): HiddenPlant {
  const rand = uniformRng(seed)
  rand() // 小 seed 的第一個值分布不均，丟掉
  let h = candidate(rand, level)
  for (let k = 0; k < 30 && reject(h); k++) h = candidate(rand, level)
  return h
}

/**
 * 參考解答：照隱藏機構算的前饋（kS 取往上往下的平均，kG 補上不對稱的一半，正好在靜摩擦範圍中間），
 * kP 1 V/cm，Motion Magic 放慢到理論的 60%（重的機構用理論速度會頂到電壓或電流上限）。
 * 產生題目時用它確認「有解」。
 */
export function referenceSolution(h: HiddenPlant, theory: { kG: number; kV: number; kA: number }) {
  return {
    kS: (h.frictionUp + h.frictionDown) / 2,
    kG: theory.kG * h.kGScale + (h.frictionUp - h.frictionDown) / 2,
    kV: theory.kV * h.kVScale,
    kA: theory.kA * h.kAScale,
    kP: 100,
    motionMagicScale: 0.6,
  }
}

export type ChallengeStatus = 'playing' | 'won' | 'lost'

/** 送出一次之後的狀態：達標就贏；次數用完還沒達標就輸 */
export function nextStatus(passed: boolean, attempts: number, max: number): ChallengeStatus {
  if (passed) return 'won'
  return attempts >= max ? 'lost' : 'playing'
}
