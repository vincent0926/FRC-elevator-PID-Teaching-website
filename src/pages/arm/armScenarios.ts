import type { ControllerLocation, GravityType } from '../../core/controller/slot0'
import { kPFromVoltsPerDeg, type ArmFeedforwardResult } from '../../core/arm/feedforward'
import { DEG, type ArmParameterSet } from '../../schema/armParameterSet'
import type { ArmKnobs } from './armSim'
import { t } from '../../core/lang'

/**
 * 3F 手臂教學情境：每一個都故意設錯一件事，armScenarios.test.ts 檢查圖上真的看得到。
 */

export interface ArmScenarioSetup {
  params: ArmParameterSet
  knobs: Partial<ArmKnobs>
  location: ControllerLocation
  gravityType: GravityType
  /** 這個情境要看的目標角度（rad） */
  goal: number
}

export interface ArmScenario {
  id: string
  title: string
  concept: string
  lookFor: string
  tryNext: string
  setup(theory: ArmParameterSet, ff: ArmFeedforwardResult): ArmScenarioSetup
}

function params(
  t: ArmParameterSet,
  note: string,
  patch: { ff?: Partial<ArmParameterSet['feedforward']>; fb?: Partial<ArmParameterSet['feedback']>; mm?: Partial<ArmParameterSet['motionMagic']> },
): ArmParameterSet {
  return {
    ...t,
    source: 'custom',
    createdAt: new Date().toISOString(),
    note,
    feedforward: { ...t.feedforward, ...patch.ff },
    feedback: { ...t.feedback, ...patch.fb },
    motionMagic: { ...t.motionMagic, ...patch.mm },
  }
}

export const ARM_SCENARIOS: ArmScenario[] = [
  {
    id: 'armAsElevator',
    title: t('把手臂當電梯（kG 沒乘 cos）', 'Treating the arm as an elevator (kG without cos)'),
    concept:
      t('重力對手臂的力矩跟角度有關：水平最大，越往上越小，直立時是 0。控制器如果照電梯的方式給固定的 kG（Phoenix 6 的 GravityType 沒設成 Arm_Cosine），手臂抬高時 kG 就給太多，停在目標上面。', 'Gravity’s torque on an arm depends on angle: largest at horizontal, smaller as it rises, 0 at vertical. If the controller gives a constant kG like an elevator (Phoenix 6 GravityType not set to Arm_Cosine), kG is too much as the arm rises and it stops above the target.'),
    lookFor: t('轉到 80° 時，綠色前饋一直是固定的 kG，沒有跟著角度變小；位置停在目標上面，紅色回授是負的（在往下壓）。', 'Turning to 80°, the green feedforward stays at a constant kG instead of shrinking with angle; the position stops above the target and the red feedback is negative (pushing down).'),
    tryNext: t('把「重力型態」切回 Arm_Cosine（kG·cos θ），誤差就消失了。程式裡記得設 GravityType = Arm_Cosine。', 'Switch “Gravity type” back to Arm_Cosine (kG·cos θ) and the error disappears. In code, remember to set GravityType = Arm_Cosine.'),
    setup: (th) => ({ params: params(th, t('情境：把手臂當電梯', 'Scenario: arm as an elevator'), {}), knobs: { realistic: false }, location: 'talonfx', gravityType: 'constant', goal: 80 * DEG }),
  },
  {
    id: 'noKg',
    title: t('沒有 kG', 'No kG'),
    concept: t('沒有重力補償，只靠 kP 撐住手臂：要先往下掉一點，誤差乘 kP 才撐得住。越接近水平（cos 越大）掉越多。', 'With no gravity compensation, only kP holds the arm: it has to droop a bit first so error × kP can hold it. The closer to horizontal (bigger cos), the more it droops.'),
    lookFor: t('停在目標下面；紅色回授電壓一直是正的，大小大約是 kG·cos θ。', 'It stops below the target; the red feedback voltage stays positive, about kG·cos θ.'),
    tryNext: t('把 kG 填回理論值；再把目標改成 80°，看同樣沒有 kG 時，高角度掉得比較少（cos 80° 很小）。', 'Put kG back to theory; then set the target to 80° and see that without kG it droops less at high angles (cos 80° is small).'),
    setup: (th) => ({ params: params(th, t('情境：沒有 kG', 'Scenario: no kG'), { ff: { kG: 0 } }), knobs: { realistic: false }, location: 'talonfx', gravityType: 'armCosine', goal: 20 * DEG }),
  },
  {
    id: 'crossVertical',
    title: t('轉過直立（cos 變負）', 'Past vertical (cos goes negative)'),
    concept: t('過了 90° 之後，重力把手臂往另一邊拉，kG·cos θ 變成負的：前饋要「往回拉」，不是往上推。Arm_Cosine 會自動處理正負號。', 'Past 90°, gravity pulls the arm the other way and kG·cos θ goes negative: feedforward has to “pull back”, not push up. Arm_Cosine handles the sign automatically.'),
    lookFor: t('轉到 110° 時，綠色前饋在 90° 附近經過 0，過了之後變負的。', 'Turning to 110°, the green feedforward crosses 0 near 90° and goes negative after.'),
    tryNext: t('把重力型態改成「常數 kG」再跑一次：過了直立還在往外推，會衝過頭。', 'Change the gravity type to “constant kG” and run again: past vertical it keeps pushing outward and overshoots.'),
    setup: (th) => ({ params: params(th, t('情境：轉過直立', 'Scenario: past vertical'), {}), knobs: { realistic: false }, location: 'talonfx', gravityType: 'armCosine', goal: 110 * DEG }),
  },
  {
    id: 'heavyPayload',
    title: t('夾了很重的遊戲物件', 'Holding a heavy game piece'),
    concept: t('夾爪上多了東西，重力力矩和轉動慣量都變大，但參數還是空手時的 kG、kA。末端的負載力臂最長，影響比電梯大得多。', 'With extra weight in the gripper, gravity torque and moment of inertia both grow, but the gains are still the empty kG and kA. The load at the tip has the longest lever arm, so the effect is much bigger than on an elevator.'),
    lookFor: t('停在目標下面；加速時跟不太上（kA 不夠）。', 'It stops below the target and can’t quite keep up while accelerating (not enough kA).'),
    tryNext: t('到 1F 把負載質量填成實際的值，理論 kG、kA 會一起變；或是有夾、沒夾各用一組 kG。', 'In 1F set the load mass to the real value and theory kG and kA change together; or use separate kG values with and without the piece.'),
    setup: (th) => ({ params: params(th, t('情境：負載變重', 'Scenario: heavier load'), {}), knobs: { realistic: false, kGScale: 2, kAScale: 1.6 }, location: 'talonfx', gravityType: 'armCosine', goal: 20 * DEG }),
  },
  {
    id: 'wrongZero',
    title: t('編碼器零點不在水平', 'Encoder zero not at horizontal'),
    concept: t('Arm_Cosine 假設角度 0 = 水平。如果編碼器的 0 設在收起的位置（例如水平下面 30°），控制器算的 cos θ 跟真正的重力角度差 30°，kG 在每個角度都給錯。', 'Arm_Cosine assumes angle 0 = horizontal. If the encoder’s 0 is at the stowed position (say 30° below horizontal), the cos θ the controller computes is 30° off from the real gravity angle, and kG is wrong at every angle.'),
    lookFor: t('轉到 90° 時控制器以為直立不用出力，其實手臂還差 30° 才直立，會往下掉；紅色回授一直是正的。', 'At 90° the controller thinks it’s vertical and needs no effort, but the arm is really 30° short of vertical and droops; the red feedback stays positive.'),
    tryNext: t('把「編碼器零點偏差」改回 0。程式裡：讓 0 = 水平（CANcoder 設 MagnetOffset，或內建編碼器開機時設成已知角度）。', 'Set “Encoder zero offset” back to 0. In code: make 0 = horizontal (set MagnetOffset on a CANcoder, or set a known angle at boot with the built-in encoder).'),
    setup: (th) => ({ params: params(th, t('情境：零點設錯', 'Scenario: wrong zero'), {}), knobs: { realistic: false, zeroOffset: -30 * DEG }, location: 'talonfx', gravityType: 'armCosine', goal: 90 * DEG }),
  },
  {
    id: 'armWindup',
    title: t('用 kI 補 kG（積分飽和）', 'kI covering for kG (integral windup)'),
    concept: t('kG 少給了，改用 kI 慢慢補。只要輸出頂到上限（電池低、加速度太大），誤差一直累積在積分裡，追上後放不掉就衝過頭。', 'kG is too small, so kI is used to slowly make it up. As soon as the output hits its limit (low battery, acceleration too high), the error keeps building in the integral; once it catches up it can’t let go, so it overshoots.'),
    lookFor: t('電壓先貼到上限，到位時角度衝過目標好幾度才退回來。', 'The voltage first hits the limit, then on arrival the angle overshoots the target by several degrees before coming back.'),
    tryNext: t('打開「積分防飽和」比較四種做法；最好的還是把 kG 修好、kI 用 0。', 'Turn on “Anti-windup” and compare the four approaches; the best fix is still to correct kG and use kI = 0.'),
    setup: (th, ff) => ({
      params: params(th, t('情境：用 kI 補 kG', 'Scenario: kI covering for kG'), { ff: { kS: 0.15, kG: ff.kG * 0.5 }, fb: { kI: 300 }, mm: { cruiseVelocity: ff.maxVelocity, acceleration: ff.maxAccelUp } }),
      knobs: { realistic: true, batteryVoltage: 9 },
      location: 'talonfx',
      gravityType: 'armCosine',
      goal: 60 * DEG,
    }),
  },
  {
    id: 'armKpTooBig',
    title: t('kP 太大', 'kP too big'),
    concept: t('感測器有幾毫秒的延遲，kP 太大時控制器對舊的誤差用力過猛，推過頭再拉回來，到位時抖。手臂慣量小、齒比大時特別容易。', 'The sensor has a few milliseconds of delay; with kP too big the controller overreacts to old error, overshoots and pulls back, jittering on arrival. Especially likely with a light arm and a big gear ratio.'),
    lookFor: t('到位時角度上下抖，電壓來回打。', 'On arrival the angle jitters up and down and the voltage slams back and forth.'),
    tryNext: t('把 kP 降到「每度 0.2–0.5 V」。前饋準的話，kP 不用大。', 'Lower kP to “0.2–0.5 V per degree”. With accurate feedforward, kP doesn’t need to be big.'),
    setup: (th) => ({
      params: params(th, t('情境：kP 太大', 'Scenario: kP too big'), { ff: { kS: 0.15 }, fb: { kP: kPFromVoltsPerDeg(6) } }),
      knobs: { realistic: true, sensor: true, sensorDelay: 0.005, sensorNoise: 0 },
      location: 'talonfx',
      gravityType: 'armCosine',
      goal: 45 * DEG,
    }),
  },
]
