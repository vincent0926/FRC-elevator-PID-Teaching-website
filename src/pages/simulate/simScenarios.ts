import type { AntiWindup, ControllerLocation } from '../../core/controller/slot0'
import { kPFromVoltsPerCm, type FeedforwardResult } from '../../core/feedforward'
import type { ParameterSet } from '../../schema/parameterSet'
import type { PlantKnobs } from './plantKnobs'

/**
 * 3F 教學情境（Phase 3 步驟 7）：按一下就載入一組「故意設錯」的參數或受控體，附觀念說明。
 * 每個情境在 simScenarios.test.ts 都有檢查，確認圖上真的看得到說明裡講的現象。
 */

export interface SimScenarioSetup {
  params: ParameterSet
  knobs: Partial<PlantKnobs>
  location: ControllerLocation
  /** 沒給就是「沒有防飽和」 */
  antiWindup?: AntiWindup
}

export interface SimScenario {
  id: string
  title: string
  /** 為什麼會這樣（兩三句） */
  concept: string
  /** 圖上看哪裡 */
  lookFor: string
  /** 看完之後動手改什麼 */
  tryNext: string
  setup(theory: ParameterSet, ff: FeedforwardResult): SimScenarioSetup
}

/** 範例真實摩擦 0.15 V，情境裡的 kS 預設就補這麼多 */
const FRICTION = 0.15

function params(
  theory: ParameterSet,
  note: string,
  patch: { ff?: Partial<ParameterSet['feedforward']>; fb?: Partial<ParameterSet['feedback']>; mm?: Partial<ParameterSet['motionMagic']> },
): ParameterSet {
  return {
    ...theory,
    source: 'custom',
    createdAt: new Date().toISOString(),
    note,
    feedforward: { ...theory.feedforward, ...patch.ff },
    feedback: { ...theory.feedback, ...patch.fb },
    motionMagic: { ...theory.motionMagic, ...patch.mm },
    slotByDirection: undefined,
  }
}

export const SIM_SCENARIOS: SimScenario[] = [
  {
    id: 'onlyKp',
    title: '只有 kP，沒有前饋',
    concept:
      '很多隊伍一開始只調 kP。kP 只看「差多少」，要先落後才會出力，所以電梯一定追在軌跡後面；停下來時還要靠誤差撐住重力，永遠停在目標下面 kG / kP。',
    lookFor: '位置圖的實際位置一直落後虛線；電壓圖裡綠色前饋是 0，全部靠紅色回授。',
    tryNext: '把 kG 填回理論值，再依序加 kV、kA，看紅色回授怎麼一路縮小到接近 0。',
    setup: (t) => ({
      params: params(t, '情境：只有 kP', { ff: { kS: 0, kG: 0, kV: 0, kA: 0 } }),
      knobs: { realistic: false },
      location: 'talonfx',
    }),
  },
  {
    id: 'noKg',
    title: '沒有 kG',
    concept: '沒有 kG，靜止時只能靠 kP 撐住重力：kP·誤差 = kG，所以誤差 = kG / kP。kP 越小掉越多；把 kP 加大只會掉少一點，不會變成 0。',
    lookFor: '兩次移動結束後，實際位置都停在目標下面；靜止時紅色回授一直是正的，大小剛好等於理論 kG。',
    tryNext: '先把 kP 加倍，看誤差是不是減半；再把 kG 填回理論值，誤差直接消失。',
    setup: (t) => ({
      params: params(t, '情境：沒有 kG', { ff: { kG: 0 }, fb: { kP: kPFromVoltsPerCm(0.25) } }),
      knobs: { realistic: false },
      location: 'talonfx',
    }),
  },
  {
    id: 'kPTooBig',
    title: 'kP 太大',
    concept:
      '真的感測器有延遲（CAN、濾波），控制器看到的是幾毫秒前的位置。kP 很大時，它對「舊的誤差」用力過猛，推過頭再拉回來，就開始振盪。這個情境 kP 是「誤差 1 cm 給 20 V」。',
    lookFor: '到位時位置上下抖；電壓圖貼著電池電壓來回打，電流一直頂到限制。',
    tryNext: '把 kP 降到 1–2 V/cm（100–200 V/m），振盪就停了。前饋準的話，kP 不用大。',
    setup: (t) => ({
      params: params(t, '情境：kP 太大', { ff: { kS: FRICTION }, fb: { kP: kPFromVoltsPerCm(20) } }),
      knobs: { realistic: true, sensor: true, sensorDelay: 0.005, sensorNoise: 0 },
      location: 'talonfx',
    }),
  },
  {
    id: 'kDTooBig',
    title: 'kD 太大（放大雜訊）',
    concept:
      'kD 乘的是「速度誤差」，而量到的速度本來就會抖。kD 太大時，這些雜訊被放大成電壓亂跳，馬達會發出嗡嗡聲、發熱，位置卻沒有比較準。',
    lookFor: '看電壓圖：到位以後紅色回授變成一條很粗的毛線；位置圖幾乎看不出差別。',
    tryNext: '把 kD 改成 0 或 1 以內，比較指標表的「到位電壓抖動」。電梯前饋準的話通常不需要 kD。',
    setup: (t) => ({
      params: params(t, '情境：kD 太大', { ff: { kS: FRICTION }, fb: { kD: 40 } }),
      knobs: { realistic: true, sensor: true, sensorDelay: 0.002, sensorNoise: 0.001 },
      location: 'talonfx',
    }),
  },
  {
    id: 'whyNoKi',
    title: '為什麼不用 kI',
    concept:
      'kG 不準的時候，很多人用 kI 把穩態誤差「補」掉，平常看起來有效。但只要輸出頂到上限（電池沒電、加速度設太大），誤差會一直累積在積分裡，等追上軌跡時積分還放不掉，就衝過頭。這叫積分飽和（windup）。',
    lookFor: '往上移動：電壓先貼到上限，軌跡結束後位置衝過目標好幾公分，才慢慢退回來。',
    tryNext: '把 kI 改成 0、kG 改回理論值：超調消失。先把 kG 弄準，而不是用 kI 補。',
    setup: (t, ff) => ({
      params: params(t, '情境：用 kI 補 kG', { ff: { kS: FRICTION, kG: ff.kG * 0.6 }, fb: { kI: 500 } }),
      knobs: { realistic: true, batteryVoltage: 9 },
      location: 'talonfx',
    }),
  },
  {
    id: 'antiWindup',
    title: '積分防飽和（Anti-Windup）',
    concept:
      '一定要用 kI 的時候（例如機構的摩擦很難補），要加積分防飽和：輸出頂到上限時不要再積分（條件積分），或只在接近目標時才積分（I-Zone），或把被限制掉的部分回饋給積分（反算）。WPILib 的 PIDController 有 setIZone()、setIntegratorRange() 可以用。',
    lookFor: '先看「沒有」：電壓貼到上限、積分一路長，到位時衝過頭。再切成其他三種，看超調怎麼縮小。',
    tryNext: '把「積分防飽和」切成「飽和時停止積分」「I-Zone」「反算」各跑一次比較。最後還是記得：先把 kG 弄準，kI 能不用就不用。',
    setup: (t, ff) => ({
      params: params(t, '情境：積分防飽和', { ff: { kS: FRICTION, kG: ff.kG * 0.6 }, fb: { kI: 500 } }),
      knobs: { realistic: true, batteryVoltage: 9 },
      location: 'talonfx',
      antiWindup: { mode: 'none' },
    }),
  },
  {
    id: 'controlPeriod',
    title: '控制週期：TalonFX 對 roboRIO',
    concept:
      '同一個 kP，在 TalonFX 上每 1 ms 算一次，在 roboRIO 上 20 ms 才算一次。兩次計算之間輸出不會變，等於控制器每次都晚了一點；kP 大的時候，晚一點就足以讓它振盪。',
    lookFor: '到位後位置一直抖、電壓在正負之間打；跟隨誤差也比較大，因為參考軌跡 20 ms 才更新一次。',
    tryNext: '到下面「控制器位置」切成 TalonFX，同一組參數馬上變穩。這就是閉迴路放在 TalonFX 上的原因。',
    setup: (t) => ({
      params: params(t, '情境：roboRIO 50 Hz', { fb: { kP: kPFromVoltsPerCm(7) } }),
      knobs: { realistic: false },
      location: 'roborio',
    }),
  },
  {
    id: 'sensorDelay',
    title: '感測延遲',
    concept: '控制器看到的位置晚了 40 ms。就算 kP 本來很合理，延遲夠大時一樣會推過頭：它以為還沒到，其實已經到了。',
    lookFor: '位置圖到位時先衝過頭再退回來，比沒有延遲時多好幾公分。',
    tryNext: '到「真實模型」把感測延遲改成 5 ms，或把 kP 降一半，比較超調。',
    setup: (t) => ({
      params: params(t, '情境：感測延遲 40 ms', { ff: { kS: FRICTION } }),
      knobs: { realistic: true, sensor: true, sensorDelay: 0.04, sensorNoise: 0 },
      location: 'talonfx',
    }),
  },
  {
    id: 'lowBattery',
    title: '電池電壓太低',
    concept:
      '理論的 Motion Magic 速度是用 11 V 算的。電池只剩 9 V 時，往上等速段需要的電壓超過電池給得起的，前饋再準也追不上。這是物理限制，調 PID 沒用。',
    lookFor: '往上移動時電壓貼在上限（指標的「電壓飽和」變紅），位置落後軌跡；往下不用對抗重力，所以沒事。',
    tryNext: '把電池電壓改回 12.5 V，或把巡航速度降 20%。比賽前記得換電池。',
    setup: (t) => ({
      params: params(t, '情境：電池 9 V', { ff: { kS: FRICTION } }),
      knobs: { realistic: true, batteryVoltage: 9 },
      location: 'talonfx',
    }),
  },
  {
    id: 'currentLimit',
    title: '超過電流限制',
    concept:
      '加速度設成理論值的 3 倍。加速需要的電流超過 Stator 電流限制，TalonFX 會自動降電壓，所以實際加速度上不去，減速時也煞不住。',
    lookFor: '電流圖平平地頂在限制值；位置在加速段落後、到位時衝過頭。',
    tryNext: '把加速度改回理論值，電流就不會頂到。想更快就要換齒比或加馬達，不是調 PID。',
    setup: (t) => ({
      params: params(t, '情境：加速度 ×3', { ff: { kS: FRICTION }, mm: { acceleration: t.motionMagic.acceleration * 3 } }),
      knobs: { realistic: true },
      location: 'talonfx',
    }),
  },
  {
    id: 'asymFriction',
    title: '摩擦往上往下不一樣',
    concept:
      '往上摩擦 0.35 V、往下只有 0.05 V，但 Phoenix 6 的 kS 只能設一個值。先用平均值 0.2 V 試試看：kG 和 kS 會一起吸收大部分的差異，影響常常小到可以不管。',
    lookFor: '看指標表：兩個方向的跟隨誤差都還在 1 cm 以內。如果你的電梯差很多，再考慮 Slot 切換。',
    tryNext: '勾「往下用 Slot 1」，往上 kS 填 0.35、往下填 0.05，比較指標差多少，再決定值不值得多一個 Slot。',
    setup: (t) => ({
      params: params(t, '情境：摩擦不對稱', { ff: { kS: 0.2 } }),
      knobs: { realistic: true, friction: true, frictionUp: 0.35, frictionDown: 0.05 },
      location: 'talonfx',
    }),
  },
  {
    id: 'stageJump',
    title: '連續式換級 kG 跳變',
    concept:
      '連續式電梯換級時，被拉動的質量改變，需要的 kG 在行程一半突然多了 0.8 V。前饋的 kG 只有一個值，多出來的只能靠 kP 補，所以上半段會停低一點。',
    lookFor: '往上停在高處（超過行程一半）時停在目標下面；往下回到低處就準了。靜止時紅色回授大約 0.8 V。',
    tryNext: '試著把 kP 加大（誤差變小但不會消失），或用 Slot 依高度切換 kG。Phoenix 6 的 Slot 只有 3 個，方向和高度要一起規劃。',
    setup: (t) => ({
      params: params(t, '情境：換級 kG 跳變', { ff: { kS: FRICTION } }),
      knobs: { realistic: true, stageJump: true, stageJumpDelta: 0.8 },
      location: 'talonfx',
    }),
  },
  {
    id: 'softLimit',
    title: '目標超過軟體限位',
    concept:
      '軟體限位設在行程 60%，目標卻是 75%。電梯到了限位，控制器就把往上的輸出關掉（neutral）；可是電梯停著要靠 kG 往上撐，輸出一關就往下掉，掉到限位下面又打開，所以會在限位附近一直抖。',
    lookFor: '位置停在 60% 左右上下抖；電壓圖在 0 和 kG 之間跳；指標表下面有「軟體限位擋住了」。',
    tryNext: '把目標改到限位以下（例如 0.7 m），或把限位調高。限位是保護用的，正常動作不應該碰到它。',
    setup: (t) => ({
      params: params(t, '情境：軟體限位', { ff: { kS: FRICTION } }),
      knobs: { realistic: true, softLimit: true, softForward: Math.round(t.mechanism.travel * 0.6 * 100) / 100, softReverse: 0 },
      location: 'talonfx',
    }),
  },
  {
    id: 'supplyLimit',
    title: 'Supply 電流限制設太低',
    concept:
      'Supply 電流限制管的是從電池拿多少電，用來保護斷路器。設成每顆 15 A 時，加速段需要的電流拿不到，控制器降電壓，電梯追不上軌跡。',
    lookFor: '電流圖：藍色虛線（電池端電流）在加速時被壓平在 15 A；位置在加速段落後。',
    tryNext: '把 Supply 限制調到 40 A 左右，或乾脆關掉只留 Stator 限制，比較加速段的跟隨誤差。',
    setup: (t) => ({
      params: params(t, '情境：Supply 限制太低', { ff: { kS: FRICTION } }),
      knobs: { realistic: true, supplyLimit: true, supplyLimitA: 15 },
      location: 'talonfx',
    }),
  },
  {
    id: 'sparkNoComp',
    title: 'SPARK MAX 沒開電壓補償',
    concept:
      'SPARK MAX 的閉迴路輸出是佔空比，不是伏特。kG 是用 12 V 算的，電池只剩 10.5 V 又沒開電壓補償時，同樣的佔空比只給 kG 的 88%，電梯撐不住，停得比目標低。',
    lookFor: '停住時位置在目標下面，而且電池越低差越多；回授輸出一直偏正（在幫 kG 補）。',
    tryNext: '到「馬達控制器」打開電壓補償，或換成 TalonFX 比較（Phoenix 6 的 VoltageOut 本來就是伏特）。',
    setup: (t) => ({
      params: params(t, '情境：SPARK MAX 沒電壓補償', { ff: { kS: FRICTION }, fb: { kP: kPFromVoltsPerCm(0.1) } }),
      knobs: { realistic: true, batteryVoltage: 10.5, controllerType: 'sparkmax', voltageComp: false },
      location: 'talonfx',
    }),
  },
]
