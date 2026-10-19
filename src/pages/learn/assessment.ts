import { t } from '../../core/lang'
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
  { id: 'holdLow', label: t('停住時停在目標下面一點，回授一直是正的', 'Stops a little below the target, with feedback always positive') },
  { id: 'holdHigh', label: t('停住時回授一直是負的（在幫忙往下壓），往上往下都一樣', 'When stopped, feedback is always negative (helping push down), the same going up and down') },
  { id: 'dirOpposite', label: t('往上時回授偏正、往下時偏負，大小差不多', 'Feedback leans positive going up and negative going down, by about the same amount') },
  { id: 'cruiseLag', label: t('等速段一直落後目標，速度越快差越多', 'Keeps lagging the target in the constant-velocity section, more the faster it goes') },
  { id: 'accelOnly', label: t('回授只在加速、減速的瞬間冒出來，等速時回到 0', 'Feedback only pops up at the moments of acceleration and deceleration, back to 0 at constant velocity') },
  { id: 'oscillate', label: t('到位後位置和電壓一起來回擺', 'After arriving, position and voltage swing back and forth together') },
  { id: 'voltJitter', label: t('到位後電壓一直抖，但位置幾乎沒動', 'After arriving the voltage keeps jittering, but the position barely moves') },
  { id: 'saturated', label: t('輸出電壓貼著電池電壓，跟隨誤差很大', 'Output voltage is pinned to the battery voltage and the following error is large') },
]

export const EVIDENCE: Option[] = [
  { id: 'fbHoldSign', label: t('靜止保持時，回授電壓一直在 0 的同一邊', 'While holding still, feedback voltage stays on one side of 0') },
  { id: 'fbDirSign', label: t('回授的正負號跟著移動方向改變', 'Feedback’s sign changes with the direction of motion') },
  { id: 'fbCruise', label: t('等速段回授有固定偏移，跟速度有關', 'Feedback has a steady offset in the constant-velocity section, related to velocity') },
  { id: 'fbAccel', label: t('回授只在加減速時出現', 'Feedback only appears during acceleration and deceleration') },
  { id: 'posOsc', label: t('位置在目標附近來回擺', 'Position swings back and forth around the target') },
  { id: 'voltOscPosStill', label: t('電壓抖得很厲害，位置卻幾乎不動', 'Voltage jitters a lot but the position barely moves') },
  { id: 'voltAtBattery', label: t('輸出電壓貼著電池電壓（飽和）', 'Output voltage is pinned to the battery voltage (saturated)') },
  { id: 'followBig', label: t('位置跟目標軌跡差很多', 'Position is far off the target profile') },
]

export const COMPONENTS: Option[] = [
  { id: 'kG', label: t('kG（重力）', 'kG (gravity)') },
  { id: 'kS', label: t('kS（靜摩擦）', 'kS (static friction)') },
  { id: 'kV', label: t('kV（速度）', 'kV (velocity)') },
  { id: 'kA', label: t('kA（加速度）', 'kA (acceleration)') },
  { id: 'kP', label: 'kP' },
  { id: 'kD', label: 'kD' },
  { id: 'mm', label: t('Motion Magic 速度／加速度（物理限制）', 'Motion Magic velocity / acceleration (physical limit)') },
]

export const CHANGES: Option[] = [
  { id: 'kG+', label: t('把 kG 調大', 'Raise kG') },
  { id: 'kG-', label: t('把 kG 調小', 'Lower kG') },
  { id: 'kS+', label: t('加上 kS', 'Add kS') },
  { id: 'kV+', label: t('把 kV 調大', 'Raise kV') },
  { id: 'kA+', label: t('把 kA 調大', 'Raise kA') },
  { id: 'kP-', label: t('把 kP 調小（或閉迴路改放 TalonFX）', 'Lower kP (or move the closed loop to the TalonFX)') },
  { id: 'kD-', label: t('把 kD 調小', 'Lower kD') },
  { id: 'mm-', label: t('降低 Motion Magic 速度或加速度', 'Lower Motion Magic velocity or acceleration') },
  { id: 'kI+', label: t('加 kI 把誤差補掉', 'Add kI to make up the error') },
]

export const EXPECTS: Option[] = [
  { id: 'holdZero', label: t('停住時回授回到 0 附近，停在目標上', 'When stopped, feedback returns near 0 and it stops on the target') },
  { id: 'dirZero', label: t('往上往下的回授都接近 0', 'Feedback near 0 both going up and going down') },
  { id: 'cruiseTrack', label: t('等速段貼著目標', 'Hugs the target in the constant-velocity section') },
  { id: 'accelQuiet', label: t('加減速時不再冒出回授', 'No more feedback popping up during acceleration and deceleration') },
  { id: 'noOsc', label: t('到位後不再擺', 'No more swinging after arrival') },
  { id: 'quietVolt', label: t('到位後電壓不再抖', 'No more voltage jitter after arrival') },
  { id: 'notSaturated', label: t('電壓不再貼上限，跟隨誤差變小', 'Voltage no longer pinned at the limit, following error shrinks') },
]

export const SAFETY: (Option & { ok: boolean })[] = [
  { id: 'unit0', label: t('上機前重做單元零（行程、方向、軟體限位、保護）', 'Redo unit 0 before the robot (travel, direction, soft limits, protections)'), ok: true },
  { id: 'oneChange', label: t('一次只改一個參數', 'Change only one gain at a time'), ok: true },
  { id: 'slowFirst', label: t('Motion Magic 先用 25% 跑一次再慢慢加', 'Run Motion Magic at 25% first, then increase slowly'), ok: true },
  { id: 'disableHand', label: t('有人手放在 Driver Station 的 Disable 上', 'Someone has a hand on Disable at the Driver Station'), ok: true },
  { id: 'logAgain', label: t('改完再錄一份日誌，確認跟預期一樣', 'Record another log after the change to confirm it matches expectations'), ok: true },
  { id: 'simFirst', label: t('先在 3F 模擬預覽這個改動', 'Preview this change in the 3F sim first'), ok: true },
  { id: 'doubleKp', label: t('順便把 kP 加倍，比較快到位', 'Double kP too while you’re at it, to arrive faster'), ok: false },
  { id: 'noSoftLimit', label: t('先關掉軟體限位，避免被擋住', 'Turn off the soft limits first so it doesn’t get blocked'), ok: false },
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
  { scenario: 'lowKg', symptom: 'holdLow', evidence: ['fbHoldSign'], component: 'kG', change: 'kG+', expect: 'holdZero', why: t('靜止時速度、加速度都是 0，前饋只剩 kG。回授一直補正的，代表 kG 不夠撐住重力。', 'At rest velocity and acceleration are both 0, so feedforward is just kG. Feedback constantly adding positive means kG isn’t enough to hold up gravity.') },
  { scenario: 'highKg', symptom: 'holdHigh', evidence: ['fbHoldSign'], component: 'kG', change: 'kG-', expect: 'holdZero', why: t('靜止時回授一直是負的、往上往下都一樣偏，代表 kG 給太多，回授在幫忙往下壓。', 'At rest feedback is always negative, off the same way going up and down, so kG is too big and feedback is helping push down.') },
  { scenario: 'noKs', symptom: 'dirOpposite', evidence: ['fbDirSign'], component: 'kS', change: 'kS+', expect: 'dirZero', why: t('摩擦永遠擋住運動方向，所以回授的正負號跟著方向變；kG 偏的話兩個方向會偏同一邊。', 'Friction always opposes motion, so feedback’s sign follows the direction; if kG were off, both directions would lean the same way.') },
  { scenario: 'lowKv', symptom: 'cruiseLag', evidence: ['fbCruise', 'followBig'], component: 'kV', change: 'kV+', expect: 'cruiseTrack', why: t('等速段 a = 0，前饋只剩 kG + kS + kV·v；落後的量跟速度成正比，就是 kV 不夠。', 'In the constant-velocity section a = 0, so feedforward is just kG + kS + kV·v; a lag proportional to velocity means kV is too small.') },
  { scenario: 'lowKa', symptom: 'accelOnly', evidence: ['fbAccel'], component: 'kA', change: 'kA+', expect: 'accelQuiet', why: t('只有加減速時才缺電壓，等速時不缺，缺的就是 kA·a 那一項。', 'Voltage is short only while accelerating and decelerating, not at constant velocity, so what’s missing is the kA·a term.') },
  { scenario: 'oscillation', symptom: 'oscillate', evidence: ['posOsc'], component: 'kP', change: 'kP-', expect: 'noOsc', why: t('位置和電壓一起擺是真的振盪：20 ms 的控制週期加上太大的 kP，控制器一直對舊的誤差用力過猛。', 'Position and voltage swinging together is real oscillation: a 20 ms control period plus too big a kP means the controller keeps overreacting to old error.') },
  { scenario: 'noisyKd', symptom: 'voltJitter', evidence: ['voltOscPosStill'], component: 'kD', change: 'kD-', expect: 'quietVolt', why: t('位置沒動、電壓卻抖，不是振盪：kD 乘上速度的雜訊。降 kD，不是降 kP。', 'Position still but voltage jittering isn’t oscillation: kD is multiplying velocity noise. Lower kD, not kP.') },
  { scenario: 'saturate', symptom: 'saturated', evidence: ['voltAtBattery', 'followBig'], component: 'mm', change: 'mm-', expect: 'notSaturated', why: t('輸出已經貼著電池電壓，馬達全力了，調 PID 沒用；要把軌跡放慢到馬達做得到。', 'Output is already pinned to battery voltage and the motor is at full effort, so tuning PID won’t help; slow the profile down to what the motor can do.') },
]

export const PASS_SCORE = 6

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
  /** 通過：總分到 PASS_SCORE，而且上機前檢查有分、沒有選不安全的做法 */
  passed: boolean
  parts: { q: string; got: number; of: number; note: string }[]
}

/** 題目的選項清單（電梯用上面這幾份；手臂有自己的，見 pages/arm/armAssessment.ts） */
export interface OptionLists {
  symptoms: Option[]
  evidence: Option[]
  components: Option[]
  changes: Option[]
  expects: Option[]
  safety: (Option & { ok: boolean })[]
}

export const ELEVATOR_LISTS: OptionLists = { symptoms: SYMPTOMS, evidence: EVIDENCE, components: COMPONENTS, changes: CHANGES, expects: EXPECTS, safety: SAFETY }

/** 證據與上機前檢查給部分分數：選對的加分、選錯的扣分，最少 0 */
export function grade(c: AssessmentCase, a: Answers, lists: OptionLists = ELEVATOR_LISTS): Graded {
  const { symptoms: SYMPTOMS, evidence: EVIDENCE, components: COMPONENTS, changes: CHANGES, expects: EXPECTS, safety: SAFETY } = lists
  const label = (list: Option[], id: string | null) => list.find((o) => o.id === id)?.label ?? t('（沒選）', '(none picked)')
  const parts: Graded['parts'] = []
  parts.push({ q: t('1. 發生什麼事', '1. What happened'), got: a.symptom === c.symptom ? 1 : 0, of: 1, note: t(`答案：${label(SYMPTOMS, c.symptom)}`, `Answer: ${label(SYMPTOMS, c.symptom)}`) })
  const right = a.evidence.filter((e) => c.evidence.includes(e)).length
  const wrong = a.evidence.length - right
  const ev = Math.max(0, (right - wrong) / c.evidence.length) * 2
  parts.push({ q: t('2. 證據', '2. Evidence'), got: Math.round(ev * 10) / 10, of: 2, note: t(`關鍵證據：${c.evidence.map((e) => label(EVIDENCE, e)).join('；')}`, `Key evidence: ${c.evidence.map((e) => label(EVIDENCE, e)).join('; ')}`) })
  parts.push({ q: t('3. 哪個參數', '3. Which gain'), got: a.component === c.component ? 1 : 0, of: 1, note: t(`答案：${label(COMPONENTS, c.component)}`, `Answer: ${label(COMPONENTS, c.component)}`) })
  parts.push({ q: t('4. 先改什麼', '4. Change first'), got: a.change === c.change ? 1 : 0, of: 1, note: t(`答案：${label(CHANGES, c.change)}`, `Answer: ${label(CHANGES, c.change)}`) })
  parts.push({ q: t('6. 預期變化', '6. Expected change'), got: a.expect === c.expect ? 1 : 0, of: 1, note: t(`答案：${label(EXPECTS, c.expect)}`, `Answer: ${label(EXPECTS, c.expect)}`) })
  const need = SAFETY.filter((s) => s.ok).map((s) => s.id)
  const bad = a.safety.filter((s) => !need.includes(s)).length
  const good = a.safety.filter((s) => need.includes(s)).length
  const sf = bad > 0 ? 0 : (good / need.length) * 2
  parts.push({
    q: t('7. 上機前檢查', '7. Pre-robot checks'),
    got: Math.round(sf * 10) / 10,
    of: 2,
    note: bad > 0 ? t(`選了不安全的做法（${SAFETY.filter((x) => !x.ok).map((x) => x.label).join('、')}），這題 0 分。`, `Picked an unsafe action (${SAFETY.filter((x) => !x.ok).map((x) => x.label).join(', ')}), so this question scores 0.`) : t(`${good} / ${need.length} 項安全檢查。`, `${good} / ${need.length} safety checks.`),
  })
  const score = Math.round(parts.reduce((s, p) => s + p.got, 0) * 10) / 10
  // 安全不能用其他題的分數換：選了不安全的做法，或完全沒選檢查，就算總分夠也不通過
  const passed = score >= PASS_SCORE && bad === 0 && sf > 0
  return { score, max: parts.reduce((s, p) => s + p.of, 0), passed, parts }
}
