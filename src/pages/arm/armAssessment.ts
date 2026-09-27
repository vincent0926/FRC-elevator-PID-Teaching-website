import type { AssessmentCase, Option, OptionLists } from '../learn/assessment'

/**
 * 手臂 4F 單元四「期末檢核」的題目：跟電梯同一套七題與計分（learn/assessment.ts 的 grade），
 * 選項換成手臂會遇到的現象（kG 跟著 cos θ 變、重力型態、零點）。
 */

const SYMPTOMS: Option[] = [
  { id: 'holdLowHoriz', label: '停在水平附近時角度垂在目標下面，回授一直是正的；抬到接近直立時偏差變小' },
  { id: 'highAngleOver', label: '停在水平附近沒事，抬越高回授越負（在幫忙往下壓）' },
  { id: 'dirOpposite', label: '往上轉時回授偏正、往下轉時偏負，大小差不多' },
  { id: 'cruiseLag', label: '等速段一直落後目標，轉越快差越多' },
  { id: 'oscillate', label: '停住後角度和電壓一起來回擺' },
  { id: 'saturated', label: '輸出電壓貼著電池電壓，跟隨誤差很大' },
]

const EVIDENCE: Option[] = [
  { id: 'fbHoldCos', label: '停住時回授偏同一邊，偏差在水平最大、接近直立變小（跟著 cos θ）' },
  { id: 'fbGrowsWithAngle', label: '回授偏差抬越高越大（水平時是 0）' },
  { id: 'ffFlat', label: '不同角度停住時，前饋輸出都一樣高' },
  { id: 'fbDirSign', label: '回授的正負號跟著轉動方向改變' },
  { id: 'fbCruise', label: '等速段回授有固定偏移，跟角速度有關' },
  { id: 'posOsc', label: '角度在目標附近來回擺' },
  { id: 'voltAtBattery', label: '輸出電壓貼著電池電壓（飽和）' },
  { id: 'followBig', label: '角度跟目標軌跡差很多' },
]

const COMPONENTS: Option[] = [
  { id: 'kG', label: 'kG（水平時的重力電壓）' },
  { id: 'gravityType', label: 'GravityType（重力型態）' },
  { id: 'kS', label: 'kS（靜摩擦）' },
  { id: 'kV', label: 'kV（角速度）' },
  { id: 'kP', label: 'kP' },
  { id: 'mm', label: 'Motion Magic 速度／加速度（物理限制）' },
]

const CHANGES: Option[] = [
  { id: 'kG+', label: '把 kG 調大' },
  { id: 'kG-', label: '把 kG 調小' },
  { id: 'armCosine', label: 'GravityType 改成 Arm_Cosine，kG 先不動' },
  { id: 'kS+', label: '加上 kS' },
  { id: 'kV+', label: '把 kV 調大' },
  { id: 'kP-', label: '把 kP 調小（或閉迴路改放 TalonFX）' },
  { id: 'mm-', label: '降低 Motion Magic 速度或加速度' },
  { id: 'kI+', label: '加 kI 把誤差補掉' },
]

const EXPECTS: Option[] = [
  { id: 'holdZeroAll', label: '在每個角度停住時回授都回到 0 附近' },
  { id: 'dirZero', label: '往上往下的回授都接近 0' },
  { id: 'cruiseTrack', label: '等速段貼著目標' },
  { id: 'noOsc', label: '停住後不再擺' },
  { id: 'notSaturated', label: '電壓不再貼上限，跟隨誤差變小' },
]

const SAFETY: (Option & { ok: boolean })[] = [
  { id: 'unit0', label: '上機前重做單元零（方向、零點在水平、軟體限位、保護）', ok: true },
  { id: 'oneChange', label: '一次只改一個參數', ok: true },
  { id: 'slowFirst', label: 'Motion Magic 先用 25% 跑一次再慢慢加', ok: true },
  { id: 'clearSweep', label: '人離開手臂掃過的範圍，有人手放在 Disable 上', ok: true },
  { id: 'logAgain', label: '改完再錄一份日誌，確認跟預期一樣', ok: true },
  { id: 'simFirst', label: '先在 3F 模擬預覽這個改動', ok: true },
  { id: 'doubleKp', label: '順便把 kP 加倍，比較快到位', ok: false },
  { id: 'holdArm', label: '用手扶著手臂測試，比較安全', ok: false },
]

export const ARM_LISTS: OptionLists = { symptoms: SYMPTOMS, evidence: EVIDENCE, components: COMPONENTS, changes: CHANGES, expects: EXPECTS, safety: SAFETY }

export const ARM_CASES: AssessmentCase[] = [
  { scenario: 'lowKg', symptom: 'holdLowHoriz', evidence: ['fbHoldCos'], component: 'kG', change: 'kG+', expect: 'holdZeroAll', why: '停住時前饋只剩 kG·cos θ。回授一直補正的、而且水平時補最多，代表 kG（水平時的值）不夠。' },
  {
    scenario: 'elevatorStatic',
    symptom: 'highAngleOver',
    evidence: ['fbGrowsWithAngle', 'ffFlat'],
    component: 'gravityType',
    change: 'armCosine',
    expect: 'holdZeroAll',
    why: '前饋在每個角度都一樣高，表示重力補償是常數（Elevator_Static）。水平時剛好，抬高後重力力矩變小（cos θ），常數 kG 就補過頭。改 kG 大小只會讓另一個角度更糟。',
  },
  { scenario: 'noKs', symptom: 'dirOpposite', evidence: ['fbDirSign'], component: 'kS', change: 'kS+', expect: 'dirZero', why: '摩擦永遠擋住轉動方向，所以回授的正負號跟著方向變；kG 偏的話兩個方向會偏同一邊。' },
  { scenario: 'lowKv', symptom: 'cruiseLag', evidence: ['fbCruise', 'followBig'], component: 'kV', change: 'kV+', expect: 'cruiseTrack', why: '等速段 α = 0，落後的量跟角速度成正比，就是 kV 不夠。' },
  { scenario: 'oscillation', symptom: 'oscillate', evidence: ['posOsc'], component: 'kP', change: 'kP-', expect: 'noOsc', why: '角度和電壓一起擺是真的振盪：20 ms 的控制週期加上太大的 kP，控制器一直對舊的誤差用力過猛。' },
  { scenario: 'saturate', symptom: 'saturated', evidence: ['voltAtBattery', 'followBig'], component: 'mm', change: 'mm-', expect: 'notSaturated', why: '輸出已經貼著電池電壓，馬達全力了，調 PID 沒用；要把軌跡放慢到馬達做得到。' },
]
