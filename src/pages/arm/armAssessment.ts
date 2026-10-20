import type { AssessmentCase, Option, OptionLists } from '../learn/assessment'
import { t } from '../../core/lang'

/**
 * 手臂 4F 單元四「期末檢核」的題目：跟電梯同一套七題與計分（learn/assessment.ts 的 grade），
 * 選項換成手臂會遇到的現象（kG 跟著 cos θ 變、重力型態、零點）。
 */

const SYMPTOMS: Option[] = [
  { id: 'holdLowHoriz', label: t('停在水平附近時角度垂在目標下面，回授一直是正的；抬到接近直立時偏差變小', 'Stopped near horizontal the angle sags below the target and feedback stays positive; raised near vertical the offset shrinks') },
  { id: 'highAngleOver', label: t('停在水平附近沒事，抬越高回授越負（在幫忙往下壓）', 'Fine stopped near horizontal; the higher it goes, the more negative the feedback (helping push down)') },
  { id: 'dirOpposite', label: t('往上轉時回授偏正、往下轉時偏負，大小差不多', 'Feedback leans positive turning up and negative turning down, by about the same amount') },
  { id: 'cruiseLag', label: t('等速段一直落後目標，轉越快差越多', 'Keeps lagging the target in the cruise section, more the faster it turns') },
  { id: 'oscillate', label: t('停住後角度和電壓一起來回擺', 'After stopping, angle and voltage swing back and forth together') },
  { id: 'saturated', label: t('輸出電壓貼著電池電壓，跟隨誤差很大', 'Output voltage is pinned to the battery voltage and the following error is large') },
]

const EVIDENCE: Option[] = [
  { id: 'fbHoldCos', label: t('停住時回授偏同一邊，偏差在水平最大、接近直立變小（跟著 cos θ）', 'When stopped, feedback leans one way, largest at horizontal and smaller near vertical (following cos θ)') },
  { id: 'fbGrowsWithAngle', label: t('回授偏差抬越高越大（水平時是 0）', 'The feedback offset grows the higher it goes (0 at horizontal)') },
  { id: 'ffFlat', label: t('不同角度停住時，前饋輸出都一樣高', 'Feedforward output is the same height when stopped at different angles') },
  { id: 'fbDirSign', label: t('回授的正負號跟著轉動方向改變', 'Feedback’s sign changes with the direction of rotation') },
  { id: 'fbCruise', label: t('等速段回授有固定偏移，跟角速度有關', 'Feedback has a steady offset in the cruise section, related to angular velocity') },
  { id: 'posOsc', label: t('角度在目標附近來回擺', 'The angle swings back and forth around the target') },
  { id: 'voltAtBattery', label: t('輸出電壓貼著電池電壓（飽和）', 'Output voltage is pinned to the battery voltage (saturated)') },
  { id: 'followBig', label: t('角度跟目標軌跡差很多', 'The angle is far off the target profile') },
]

const COMPONENTS: Option[] = [
  { id: 'kG', label: t('kG（水平時的重力電壓）', 'kG (gravity voltage at horizontal)') },
  { id: 'gravityType', label: t('GravityType（重力型態）', 'GravityType (gravity type)') },
  { id: 'kS', label: t('kS（靜摩擦）', 'kS (static friction)') },
  { id: 'kV', label: t('kV（角速度）', 'kV (angular velocity)') },
  { id: 'kP', label: 'kP' },
  { id: 'mm', label: t('Motion Magic 速度／加速度（物理限制）', 'Motion Magic velocity / acceleration (physical limit)') },
]

const CHANGES: Option[] = [
  { id: 'kG+', label: t('把 kG 調大', 'Raise kG') },
  { id: 'kG-', label: t('把 kG 調小', 'Lower kG') },
  { id: 'armCosine', label: t('GravityType 改成 Arm_Cosine，kG 先不動', 'Change GravityType to Arm_Cosine and leave kG for now') },
  { id: 'kS+', label: t('加上 kS', 'Add kS') },
  { id: 'kV+', label: t('把 kV 調大', 'Raise kV') },
  { id: 'kP-', label: t('把 kP 調小（或閉迴路改放 TalonFX）', 'Lower kP (or move the closed loop to the TalonFX)') },
  { id: 'mm-', label: t('降低 Motion Magic 速度或加速度', 'Lower Motion Magic velocity or acceleration') },
  { id: 'kI+', label: t('加 kI 把誤差補掉', 'Add kI to make up the error') },
]

const EXPECTS: Option[] = [
  { id: 'holdZeroAll', label: t('在每個角度停住時回授都回到 0 附近', 'Feedback returns near 0 when stopped at every angle') },
  { id: 'dirZero', label: t('往上往下的回授都接近 0', 'Feedback near 0 both going up and going down') },
  { id: 'cruiseTrack', label: t('等速段貼著目標', 'Hugs the target in the cruise section') },
  { id: 'noOsc', label: t('停住後不再擺', 'No more swinging after stopping') },
  { id: 'notSaturated', label: t('電壓不再貼上限，跟隨誤差變小', 'Voltage no longer pinned at the limit, following error shrinks') },
]

const SAFETY: (Option & { ok: boolean })[] = [
  { id: 'unit0', label: t('上機前重做單元零（方向、零點在水平、軟體限位、保護）', 'Redo unit 0 before the robot (direction, zero at horizontal, soft limits, protections)'), ok: true },
  { id: 'oneChange', label: t('一次只改一個參數', 'Change only one gain at a time'), ok: true },
  { id: 'slowFirst', label: t('Motion Magic 先用 25% 跑一次再慢慢加', 'Run Motion Magic at 25% first, then increase slowly'), ok: true },
  { id: 'clearSweep', label: t('人離開手臂掃過的範圍，有人手放在 Disable 上', 'Everyone out of the arm’s sweep, with someone’s hand on Disable'), ok: true },
  { id: 'logAgain', label: t('改完再錄一份日誌，確認跟預期一樣', 'Record another log after the change to confirm it matches expectations'), ok: true },
  { id: 'simFirst', label: t('先在 3F 模擬預覽這個改動', 'Preview this change in the 3F sim first'), ok: true },
  { id: 'doubleKp', label: t('順便把 kP 加倍，比較快到位', 'Double kP too while you’re at it, to arrive faster'), ok: false },
  { id: 'holdArm', label: t('用手扶著手臂測試，比較安全', 'Hold the arm by hand while testing, to be safer'), ok: false },
]

export const ARM_LISTS: OptionLists = { symptoms: SYMPTOMS, evidence: EVIDENCE, components: COMPONENTS, changes: CHANGES, expects: EXPECTS, safety: SAFETY }

export const ARM_CASES: AssessmentCase[] = [
  { scenario: 'lowKg', symptom: 'holdLowHoriz', evidence: ['fbHoldCos'], component: 'kG', change: 'kG+', expect: 'holdZeroAll', why: t('停住時前饋只剩 kG·cos θ。回授一直補正的、而且水平時補最多，代表 kG（水平時的值）不夠。', 'When stopped, feedforward is just kG·cos θ. Feedback constantly adding positive, most at horizontal, means kG (the horizontal value) isn’t enough.') },
  {
    scenario: 'elevatorStatic',
    symptom: 'highAngleOver',
    evidence: ['fbGrowsWithAngle', 'ffFlat'],
    component: 'gravityType',
    change: 'armCosine',
    expect: 'holdZeroAll',
    why: t('前饋在每個角度都一樣高，表示重力補償是常數（Elevator_Static）。水平時剛好，抬高後重力力矩變小（cos θ），常數 kG 就補過頭。改 kG 大小只會讓另一個角度更糟。', 'Feedforward is the same height at every angle, so gravity compensation is constant (Elevator_Static). It’s right at horizontal, but raised up the gravity torque shrinks (cos θ) and a constant kG over-compensates. Changing kG’s size only makes another angle worse.'),
  },
  { scenario: 'noKs', symptom: 'dirOpposite', evidence: ['fbDirSign'], component: 'kS', change: 'kS+', expect: 'dirZero', why: t('摩擦永遠擋住轉動方向，所以回授的正負號跟著方向變；kG 偏的話兩個方向會偏同一邊。', 'Friction always opposes rotation, so feedback’s sign follows the direction; if kG were off, both directions would lean the same way.') },
  { scenario: 'lowKv', symptom: 'cruiseLag', evidence: ['fbCruise', 'followBig'], component: 'kV', change: 'kV+', expect: 'cruiseTrack', why: t('等速段 α = 0，落後的量跟角速度成正比，就是 kV 不夠。', 'In the cruise section α = 0; a lag proportional to angular velocity means kV is too small.') },
  { scenario: 'oscillation', symptom: 'oscillate', evidence: ['posOsc'], component: 'kP', change: 'kP-', expect: 'noOsc', why: t('角度和電壓一起擺是真的振盪：20 ms 的控制週期加上太大的 kP，控制器一直對舊的誤差用力過猛。', 'Angle and voltage swinging together is real oscillation: a 20 ms control period plus too big a kP means the controller keeps overreacting to old error.') },
  { scenario: 'saturate', symptom: 'saturated', evidence: ['voltAtBattery', 'followBig'], component: 'mm', change: 'mm-', expect: 'notSaturated', why: t('輸出已經貼著電池電壓，馬達全力了，調 PID 沒用；要把軌跡放慢到馬達做得到。', 'Output is already pinned to battery voltage and the motor is at full effort, so tuning PID won’t help; slow the profile down to what the motor can do.') },
]
