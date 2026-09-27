import type { AntiWindup } from '../../core/controller/slot0'
import type { FeedforwardResult } from '../../core/feedforward'
import { plantFromMechanism } from '../../core/physics/elevator'
import { NOMINAL_VOLTAGE, type SimInput } from '../../core/physics/simulate'
import { trapezoidProfile } from '../../core/profile'
import type { ElevatorMechanism, ParameterSet } from '../../schema/parameterSet'

/**
 * 3F 模擬的受控體設定。真實模型的每一項都能單獨開關（Phase 3 步驟 5），
 * 教學情境（simScenarios.ts）也用同一個格式描述。
 */

export interface PlantKnobs {
  realistic: boolean
  friction: boolean
  /** 往上、往下的摩擦（V） */
  frictionUp: number
  frictionDown: number
  currentLimit: boolean
  batterySag: boolean
  batteryVoltage: number
  gearbox: boolean
  efficiency: number
  sensor: boolean
  /** 感測延遲（s） */
  sensorDelay: number
  /** 位置雜訊標準差（m） */
  sensorNoise: number
  stageJump: boolean
  /** 換級時 kG 跳多少（V） */
  stageJumpDelta: number
  voltageLimit: boolean
  kGScale: number
  kVScale: number
  kAScale: number
  /** 目前的倍率與摩擦來自模型校正（改任何一項就不再算已校正） */
  calibrated: boolean

  // ---- 馬達控制器（真實模型才套用） ----
  controllerType: 'talonfx' | 'sparkmax'
  /** Stator 電流上限（A）；null 用 1F 機構資料的值。SPARK MAX 叫 Smart Current Limit */
  statorLimitA: number | null
  /** Supply 電流限制（TalonFX 才有） */
  supplyLimit: boolean
  supplyLimitA: number
  softLimit: boolean
  /** 軟體限位（m）；null 用預設（上：行程 95%，下：0） */
  softForward: number | null
  softReverse: number | null
  peakOutput: boolean
  /** 輸出上限，佔 12 V 的比例（TalonFX 顯示成伏特，SPARK MAX 顯示成佔空比 %） */
  peakForward: number
  peakReverse: number
  neutralMode: 'brake' | 'coast'
  /** SPARK MAX 電壓補償 */
  voltageComp: boolean
  voltageCompV: number
}

export const DEFAULT_KNOBS: PlantKnobs = {
  realistic: false,
  friction: true,
  frictionUp: 0.15,
  frictionDown: 0.15,
  currentLimit: true,
  batterySag: true,
  batteryVoltage: 12.5,
  gearbox: false,
  efficiency: 0.9,
  sensor: false,
  sensorDelay: 0.01,
  sensorNoise: 0.0005,
  stageJump: false,
  stageJumpDelta: 0.3,
  voltageLimit: true,
  kGScale: 1,
  kVScale: 1,
  kAScale: 1,
  calibrated: false,
  controllerType: 'talonfx',
  statorLimitA: null,
  supplyLimit: false,
  supplyLimitA: 40,
  softLimit: false,
  softForward: null,
  softReverse: null,
  peakOutput: false,
  peakForward: 1,
  peakReverse: 1,
  neutralMode: 'brake',
  voltageComp: true,
  voltageCompV: 12,
}

/** 軟體限位實際用的值（沒填就用預設） */
export function softLimitsOf(knobs: PlantKnobs, travel: number): { forward: number; reverse: number } {
  return { forward: knobs.softForward ?? Math.round(travel * 0.95 * 100) / 100, reverse: knobs.softReverse ?? 0 }
}

/** 速度是位置差分再濾波，雜訊大約是位置雜訊 × 20（跟範例日誌一樣） */
const VELOCITY_NOISE_PER_POSITION = 20

export interface SimSetup {
  mechanism: ElevatorMechanism
  ff: FeedforwardResult
  knobs: PlantKnobs
  controlPeriod: number
  /** 目標高度（m），會先往上到這裡，再回到行程 10% 處 */
  goal: number
  /** 到位判定的範圍（m），跟達標標準的穩態誤差一樣 */
  tolerance?: number
  antiWindup?: AntiWindup
}

export function buildSimInput(setup: SimSetup, ps: ParameterSet): SimInput {
  const { mechanism, ff, knobs } = setup
  const real = knobs.realistic
  const plant = plantFromMechanism(mechanism, ff, {
    realistic: real,
    frictionKs: real && knobs.friction ? knobs.frictionUp : 0,
    frictionKsDown: real && knobs.friction ? knobs.frictionDown : 0,
    currentLimit: knobs.currentLimit,
    statorCurrentLimit: knobs.statorLimitA ?? undefined,
    supplyCurrentLimit: knobs.controllerType === 'talonfx' && knobs.supplyLimit ? knobs.supplyLimitA : null,
    batterySag: knobs.batterySag,
    batteryVoltage: knobs.batteryVoltage,
    gearboxEfficiency: knobs.gearbox ? knobs.efficiency : 1,
    kGStepDelta: knobs.stageJump ? knobs.stageJumpDelta : 0,
    kGScale: knobs.kGScale,
    kVScale: knobs.kVScale,
    kAScale: knobs.kAScale,
  })
  const goal = Math.min(mechanism.travel, Math.max(0, setup.goal))
  const low = Math.min(mechanism.travel * 0.1, goal)
  const mm = ps.motionMagic
  const up = trapezoidProfile(low, goal, mm.cruiseVelocity, mm.acceleration)
  const down = trapezoidProfile(goal, low, mm.cruiseVelocity, mm.acceleration)
  const t2 = 0.5 + up.duration + 1.5
  return {
    plant,
    gains: { ...ps.feedforward, ...ps.feedback },
    motionMagic: mm,
    controlPeriod: setup.controlPeriod,
    initialPosition: low,
    moves: [
      { time: 0.5, goal },
      { time: t2, goal: low },
    ],
    duration: Math.min(30, t2 + down.duration + 1.5),
    tolerance: setup.tolerance,
    sensor:
      real && knobs.sensor
        ? { delay: knobs.sensorDelay, positionNoise: knobs.sensorNoise, velocityNoise: knobs.sensorNoise * VELOCITY_NOISE_PER_POSITION }
        : undefined,
    voltageLimit: real ? knobs.voltageLimit : true,
    slotByDirection: ps.slotByDirection,
    output: real ? outputConfig(knobs, mechanism.travel) : undefined,
    antiWindup: setup.antiWindup,
  }
}

function outputConfig(knobs: PlantKnobs, travel: number): NonNullable<SimInput['output']> {
  const spark = knobs.controllerType === 'sparkmax'
  // TalonFX 的輸出上限是伏特；SPARK MAX 是佔空比
  const peak = (f: number) => (spark ? f : f * NOMINAL_VOLTAGE)
  return {
    controller: knobs.controllerType,
    peakForward: knobs.peakOutput ? peak(knobs.peakForward) : undefined,
    peakReverse: knobs.peakOutput ? peak(knobs.peakReverse) : undefined,
    softLimit: knobs.softLimit ? softLimitsOf(knobs, travel) : undefined,
    neutralMode: knobs.neutralMode,
    voltageCompensation: spark ? (knobs.voltageComp ? knobs.voltageCompV : null) : undefined,
  }
}

/** 真實模型的開關，給畫面產生勾選清單 */
export type ToggleKey = 'friction' | 'batterySag' | 'gearbox' | 'sensor' | 'stageJump' | 'voltageLimit'

export const TOGGLES: { key: ToggleKey; label: string; what: string }[] = [
  { key: 'voltageLimit', label: '電壓飽和', what: '輸出最多只有電池電壓。關掉只是讓你看「如果馬達要多少給多少」會怎樣，真的馬達做不到。' },
  { key: 'friction', label: '摩擦', what: '滑軌、軸承的庫侖摩擦，速度接近 0 時會卡住。往上往下可以不一樣。' },
  { key: 'batterySag', label: '電池壓降', what: '電池內阻 0.02 Ω，電流大時電壓往下掉，飽和上限跟著變低。' },
  { key: 'gearbox', label: '齒輪箱效率', what: '馬達出力打折，要多一點電壓才撐得住。理論 kG 會偏小。' },
  { key: 'sensor', label: '感測延遲與雜訊', what: '控制器看到的位置、速度是舊的而且會抖。kP、kD 太大時最容易出事。' },
  { key: 'stageJump', label: '換級 kG 跳變', what: '連續式電梯換級時，被拉動的質量改變，kG 在行程一半突然變大。' },
]
