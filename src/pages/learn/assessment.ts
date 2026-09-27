/**
 * 4F 單元四「期末檢核」：給一份沒看過的日誌（2F 範例情境隨機挑一個，不顯示名稱），
 * 照「發生什麼 → 證據 → 哪個參數 → 先改什麼 → 為什麼 → 預期變化 → 上機前檢查」回答。
 * 分數看推理（證據、檢查）而不只是最後答案。
 */

export interface Option {
  id: string
  label: string
}

export const SYMPTOMS: Option[] = [
  { id: 'holdLow', label: '停住時停在目標下面一點，回授一直是正的' },
  { id: 'holdHigh', label: '停住時回授一直是負的（在幫忙往下壓），往上往下都一樣' },
  { id: 'dirOpposite', label: '往上時回授偏正、往下時偏負，大小差不多' },
  { id: 'cruiseLag', label: '等速段一直落後目標，速度越快差越多' },
  { id: 'accelOnly', label: '回授只在加速、減速的瞬間冒出來，等速時回到 0' },
  { id: 'oscillate', label: '到位後位置和電壓一起來回擺' },
  { id: 'voltJitter', label: '到位後電壓一直抖，但位置幾乎沒動' },
  { id: 'saturated', label: '輸出電壓貼著電池電壓，跟隨誤差很大' },
]

export const EVIDENCE: Option[] = [
  { id: 'fbHoldSign', label: '靜止保持時，回授電壓一直在 0 的同一邊' },
  { id: 'fbDirSign', label: '回授的正負號跟著移動方向改變' },
  { id: 'fbCruise', label: '等速段回授有固定偏移，跟速度有關' },
  { id: 'fbAccel', label: '回授只在加減速時出現' },
  { id: 'posOsc', label: '位置在目標附近來回擺' },
  { id: 'voltOscPosStill', label: '電壓抖得很厲害，位置卻幾乎不動' },
  { id: 'voltAtBattery', label: '輸出電壓貼著電池電壓（飽和）' },
  { id: 'followBig', label: '位置跟目標軌跡差很多' },
]

export const COMPONENTS: Option[] = [
  { id: 'kG', label: 'kG（重力）' },
  { id: 'kS', label: 'kS（靜摩擦）' },
  { id: 'kV', label: 'kV（速度）' },
  { id: 'kA', label: 'kA（加速度）' },
  { id: 'kP', label: 'kP' },
  { id: 'kD', label: 'kD' },
  { id: 'mm', label: 'Motion Magic 速度／加速度（物理限制）' },
]

export const CHANGES: Option[] = [
  { id: 'kG+', label: '把 kG 調大' },
  { id: 'kG-', label: '把 kG 調小' },
  { id: 'kS+', label: '加上 kS' },
  { id: 'kV+', label: '把 kV 調大' },
  { id: 'kA+', label: '把 kA 調大' },
  { id: 'kP-', label: '把 kP 調小（或閉迴路改放 TalonFX）' },
  { id: 'kD-', label: '把 kD 調小' },
  { id: 'mm-', label: '降低 Motion Magic 速度或加速度' },
  { id: 'kI+', label: '加 kI 把誤差補掉' },
]

export const EXPECTS: Option[] = [
  { id: 'holdZero', label: '停住時回授回到 0 附近，停在目標上' },
  { id: 'dirZero', label: '往上往下的回授都接近 0' },
  { id: 'cruiseTrack', label: '等速段貼著目標' },
  { id: 'accelQuiet', label: '加減速時不再冒出回授' },
  { id: 'noOsc', label: '到位後不再擺' },
  { id: 'quietVolt', label: '到位後電壓不再抖' },
  { id: 'notSaturated', label: '電壓不再貼上限，跟隨誤差變小' },
]

export const SAFETY: (Option & { ok: boolean })[] = [
  { id: 'unit0', label: '上機前重做單元零（行程、方向、軟體限位、保護）', ok: true },
  { id: 'oneChange', label: '一次只改一個參數', ok: true },
  { id: 'slowFirst', label: 'Motion Magic 先用 25% 跑一次再慢慢加', ok: true },
  { id: 'disableHand', label: '有人手放在 Driver Station 的 Disable 上', ok: true },
  { id: 'logAgain', label: '改完再錄一份日誌，確認跟預期一樣', ok: true },
  { id: 'simFirst', label: '先在 3F 模擬預覽這個改動', ok: true },
  { id: 'doubleKp', label: '順便把 kP 加倍，比較快到位', ok: false },
  { id: 'noSoftLimit', label: '先關掉軟體限位，避免被擋住', ok: false },
]

export interface AssessmentCase {
  /** 對應 2F 範例情境 id */
  scenario: string
  symptom: string
  evidence: string[]
  component: string
  change: string
  expect: string
  /** 參考推理（第 5 題的參考答案） */
  why: string
}

export const CASES: AssessmentCase[] = [
  { scenario: 'lowKg', symptom: 'holdLow', evidence: ['fbHoldSign'], component: 'kG', change: 'kG+', expect: 'holdZero', why: '靜止時速度、加速度都是 0，前饋只剩 kG。回授一直補正的，代表 kG 不夠撐住重力。' },
  { scenario: 'highKg', symptom: 'holdHigh', evidence: ['fbHoldSign'], component: 'kG', change: 'kG-', expect: 'holdZero', why: '靜止時回授一直是負的、往上往下都一樣偏，代表 kG 給太多，回授在幫忙往下壓。' },
  { scenario: 'noKs', symptom: 'dirOpposite', evidence: ['fbDirSign'], component: 'kS', change: 'kS+', expect: 'dirZero', why: '摩擦永遠擋住運動方向，所以回授的正負號跟著方向變；kG 偏的話兩個方向會偏同一邊。' },
  { scenario: 'lowKv', symptom: 'cruiseLag', evidence: ['fbCruise', 'followBig'], component: 'kV', change: 'kV+', expect: 'cruiseTrack', why: '等速段 a = 0，前饋只剩 kG + kS + kV·v；落後的量跟速度成正比，就是 kV 不夠。' },
  { scenario: 'lowKa', symptom: 'accelOnly', evidence: ['fbAccel'], component: 'kA', change: 'kA+', expect: 'accelQuiet', why: '只有加減速時才缺電壓，等速時不缺，缺的就是 kA·a 那一項。' },
  { scenario: 'oscillation', symptom: 'oscillate', evidence: ['posOsc'], component: 'kP', change: 'kP-', expect: 'noOsc', why: '位置和電壓一起擺是真的振盪：20 ms 的控制週期加上太大的 kP，控制器一直對舊的誤差用力過猛。' },
  { scenario: 'noisyKd', symptom: 'voltJitter', evidence: ['voltOscPosStill'], component: 'kD', change: 'kD-', expect: 'quietVolt', why: '位置沒動、電壓卻抖，不是振盪：kD 乘上速度的雜訊。降 kD，不是降 kP。' },
  { scenario: 'saturate', symptom: 'saturated', evidence: ['voltAtBattery', 'followBig'], component: 'mm', change: 'mm-', expect: 'notSaturated', why: '輸出已經貼著電池電壓，馬達全力了，調 PID 沒用；要把軌跡放慢到馬達做得到。' },
]

export interface Answers {
  symptom: string | null
  evidence: string[]
  component: string | null
  change: string | null
  why: string
  expect: string | null
  safety: string[]
}

export interface Graded {
  score: number
  max: number
  parts: { q: string; got: number; of: number; note: string }[]
}

/** 證據與上機前檢查給部分分數：選對的加分、選錯的扣分，最少 0 */
export function grade(c: AssessmentCase, a: Answers): Graded {
  const label = (list: Option[], id: string | null) => list.find((o) => o.id === id)?.label ?? '（沒選）'
  const parts: Graded['parts'] = []
  parts.push({ q: '1. 發生什麼事', got: a.symptom === c.symptom ? 1 : 0, of: 1, note: `答案：${label(SYMPTOMS, c.symptom)}` })
  const right = a.evidence.filter((e) => c.evidence.includes(e)).length
  const wrong = a.evidence.length - right
  const ev = Math.max(0, (right - wrong) / c.evidence.length) * 2
  parts.push({ q: '2. 證據', got: Math.round(ev * 10) / 10, of: 2, note: `關鍵證據：${c.evidence.map((e) => label(EVIDENCE, e)).join('；')}` })
  parts.push({ q: '3. 哪個參數', got: a.component === c.component ? 1 : 0, of: 1, note: `答案：${label(COMPONENTS, c.component)}` })
  parts.push({ q: '4. 先改什麼', got: a.change === c.change ? 1 : 0, of: 1, note: `答案：${label(CHANGES, c.change)}` })
  parts.push({ q: '6. 預期變化', got: a.expect === c.expect ? 1 : 0, of: 1, note: `答案：${label(EXPECTS, c.expect)}` })
  const need = SAFETY.filter((s) => s.ok).map((s) => s.id)
  const bad = a.safety.filter((s) => !need.includes(s)).length
  const good = a.safety.filter((s) => need.includes(s)).length
  const sf = bad > 0 ? 0 : (good / need.length) * 2
  parts.push({
    q: '7. 上機前檢查',
    got: Math.round(sf * 10) / 10,
    of: 2,
    note: bad > 0 ? '選了不安全的做法（加倍 kP、關軟體限位），這題 0 分。' : `${good} / ${need.length} 項安全檢查。`,
  })
  const score = parts.reduce((s, p) => s + p.got, 0)
  return { score: Math.round(score * 10) / 10, max: parts.reduce((s, p) => s + p.of, 0), parts }
}

export const PASS_SCORE = 6
