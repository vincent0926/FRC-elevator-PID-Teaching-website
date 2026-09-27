import type { ControllerLocation, GravityType } from '../../core/controller/slot0'
import { kPFromVoltsPerDeg, type ArmFeedforwardResult } from '../../core/arm/feedforward'
import { DEG, type ArmParameterSet } from '../../schema/armParameterSet'
import type { ArmKnobs } from './armSim'

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
    title: '把手臂當電梯（kG 沒乘 cos）',
    concept:
      '重力對手臂的力矩跟角度有關：水平最大，越往上越小，直立時是 0。控制器如果照電梯的方式給固定的 kG（Phoenix 6 的 GravityType 沒設成 Arm_Cosine），手臂抬高時 kG 就給太多，停在目標上面。',
    lookFor: '轉到 80° 時，綠色前饋一直是固定的 kG，沒有跟著角度變小；位置停在目標上面，紅色回授是負的（在往下壓）。',
    tryNext: '把「重力型態」切回 Arm_Cosine（kG·cos θ），誤差就消失了。程式裡記得設 GravityType = Arm_Cosine。',
    setup: (t) => ({ params: params(t, '情境：把手臂當電梯', {}), knobs: { realistic: false }, location: 'talonfx', gravityType: 'constant', goal: 80 * DEG }),
  },
  {
    id: 'noKg',
    title: '沒有 kG',
    concept: '沒有重力補償，只靠 kP 撐住手臂：要先往下掉一點，誤差乘 kP 才撐得住。越接近水平（cos 越大）掉越多。',
    lookFor: '停在目標下面；紅色回授電壓一直是正的，大小大約是 kG·cos θ。',
    tryNext: '把 kG 填回理論值；再把目標改成 80°，看同樣沒有 kG 時，高角度掉得比較少（cos 80° 很小）。',
    setup: (t) => ({ params: params(t, '情境：沒有 kG', { ff: { kG: 0 } }), knobs: { realistic: false }, location: 'talonfx', gravityType: 'armCosine', goal: 20 * DEG }),
  },
  {
    id: 'crossVertical',
    title: '轉過直立（cos 變負）',
    concept: '過了 90° 之後，重力把手臂往另一邊拉，kG·cos θ 變成負的：前饋要「往回拉」，不是往上推。Arm_Cosine 會自動處理正負號。',
    lookFor: '轉到 110° 時，綠色前饋在 90° 附近經過 0，過了之後變負的。',
    tryNext: '把重力型態改成「常數 kG」再跑一次：過了直立還在往外推，會衝過頭。',
    setup: (t) => ({ params: params(t, '情境：轉過直立', {}), knobs: { realistic: false }, location: 'talonfx', gravityType: 'armCosine', goal: 110 * DEG }),
  },
  {
    id: 'heavyPayload',
    title: '夾了很重的遊戲物件',
    concept: '夾爪上多了東西，重力力矩和轉動慣量都變大，但參數還是空手時的 kG、kA。末端的負載力臂最長，影響比電梯大得多。',
    lookFor: '停在目標下面；加速時跟不太上（kA 不夠）。',
    tryNext: '到 1F 把負載質量填成實際的值，理論 kG、kA 會一起變；或是有夾、沒夾各用一組 kG。',
    setup: (t) => ({ params: params(t, '情境：負載變重', {}), knobs: { realistic: false, kGScale: 2, kAScale: 1.6 }, location: 'talonfx', gravityType: 'armCosine', goal: 20 * DEG }),
  },
  {
    id: 'wrongZero',
    title: '編碼器零點不在水平',
    concept: 'Arm_Cosine 假設角度 0 = 水平。如果編碼器的 0 設在收起的位置（例如水平下面 30°），控制器算的 cos θ 跟真正的重力角度差 30°，kG 在每個角度都給錯。',
    lookFor: '轉到 90° 時控制器以為直立不用出力，其實手臂還差 30° 才直立，會往下掉；紅色回授一直是正的。',
    tryNext: '把「編碼器零點偏差」改回 0。程式裡：讓 0 = 水平（CANcoder 設 MagnetOffset，或內建編碼器開機時設成已知角度）。',
    setup: (t) => ({ params: params(t, '情境：零點設錯', {}), knobs: { realistic: false, zeroOffset: -30 * DEG }, location: 'talonfx', gravityType: 'armCosine', goal: 90 * DEG }),
  },
  {
    id: 'armWindup',
    title: '用 kI 補 kG（積分飽和）',
    concept: 'kG 少給了，改用 kI 慢慢補。只要輸出頂到上限（電池低、加速度太大），誤差一直累積在積分裡，追上後放不掉就衝過頭。',
    lookFor: '電壓先貼到上限，到位時角度衝過目標好幾度才退回來。',
    tryNext: '打開「積分防飽和」比較四種做法；最好的還是把 kG 修好、kI 用 0。',
    setup: (t, ff) => ({
      params: params(t, '情境：用 kI 補 kG', { ff: { kS: 0.15, kG: ff.kG * 0.5 }, fb: { kI: 300 }, mm: { cruiseVelocity: ff.maxVelocity, acceleration: ff.maxAccelUp } }),
      knobs: { realistic: true, batteryVoltage: 9 },
      location: 'talonfx',
      gravityType: 'armCosine',
      goal: 60 * DEG,
    }),
  },
  {
    id: 'armKpTooBig',
    title: 'kP 太大',
    concept: '感測器有幾毫秒的延遲，kP 太大時控制器對舊的誤差用力過猛，推過頭再拉回來，到位時抖。手臂慣量小、齒比大時特別容易。',
    lookFor: '到位時角度上下抖，電壓來回打。',
    tryNext: '把 kP 降到「每度 0.2–0.5 V」。前饋準的話，kP 不用大。',
    setup: (t) => ({
      params: params(t, '情境：kP 太大', { ff: { kS: 0.15 }, fb: { kP: kPFromVoltsPerDeg(6) } }),
      knobs: { realistic: true, sensor: true, sensorDelay: 0.005, sensorNoise: 0 },
      location: 'talonfx',
      gravityType: 'armCosine',
      goal: 45 * DEG,
    }),
  },
]
