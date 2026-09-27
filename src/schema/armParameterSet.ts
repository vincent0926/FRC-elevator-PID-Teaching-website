import { z } from 'zod'
import { MotorIdSchema } from './parameterSet'

/**
 * 單關節旋轉手臂的機構資料與參數組。
 * 內部一律 SI：角度用弧度（rad），0 = 水平、往上為正；角速度 rad/s。
 * 前饋、回授的數字跟電梯同一種格式，只是「位置」換成角度：kV 是 V/(rad/s)、kP 是 V/rad。
 */

export const ArmMechanismSchema = z.object({
  kind: z.literal('arm'),
  name: z.string().default('手臂'),
  motor: MotorIdSchema,
  motorCount: z.number().int().min(1).max(4),
  /** 馬達圈數 : 手臂 1 圈 */
  gearRatio: z.number().positive(),
  /** 手臂本身的質量（kg），不含夾爪上的遊戲物件 */
  armMass: z.number().nonnegative(),
  /** 手臂長度（m），從轉軸到末端 */
  armLength: z.number().positive(),
  /** 轉軸到手臂重心的距離（m）；均勻的桿子是長度的一半 */
  cgDistance: z.number().nonnegative(),
  /** 末端負載（遊戲物件、夾爪）質量（kg） */
  payloadMass: z.number().nonnegative(),
  /** 轉軸到負載的距離（m） */
  payloadDistance: z.number().nonnegative(),
  /** 可以動的角度範圍（rad，0 = 水平） */
  minAngle: z.number().min(-Math.PI).max(Math.PI),
  maxAngle: z.number().min(-Math.PI).max(Math.PI),
  statorCurrentLimit: z.number().positive(),
  /** 計算最大速度用的電壓（考慮電池壓降，通常 10–11 V） */
  calcVoltage: z.number().positive().max(13),
  /** 上機量到的靜摩擦 kS（V）；0 表示還沒量 */
  measuredKs: z.number().nonnegative().max(6).default(0),
  /** 角度感測器：TalonFX 內建編碼器（經過齒比），或 CANcoder 絕對編碼器 */
  encoder: z.enum(['internal', 'cancoder']).default('internal'),
  /** CANcoder 到手臂的比例（CANcoder 轉幾圈 : 手臂 1 圈）；裝在轉軸上就是 1 */
  cancoderToArmRatio: z.number().positive().default(1),
})

export const ArmParameterSetSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.enum(['theory', 'tuning', 'custom', 'measured']),
  createdAt: z.string(),
  note: z.string().optional(),
  mechanism: ArmMechanismSchema,
  feedforward: z.object({ kS: z.number(), kG: z.number(), kV: z.number(), kA: z.number() }),
  feedback: z.object({ kP: z.number(), kI: z.number(), kD: z.number() }),
  motionMagic: z.object({ cruiseVelocity: z.number().positive(), acceleration: z.number().positive() }),
})

export type ArmMechanism = z.infer<typeof ArmMechanismSchema>
export type ArmParameterSet = z.infer<typeof ArmParameterSetSchema>

export const DEG = Math.PI / 180

export const DEFAULT_ARM: ArmMechanism = {
  kind: 'arm',
  name: '手臂',
  motor: 'krakenX60',
  motorCount: 1,
  gearRatio: 60,
  armMass: 4,
  armLength: 0.6,
  cgDistance: 0.3,
  payloadMass: 1,
  payloadDistance: 0.6,
  minAngle: -20 * DEG,
  maxAngle: 110 * DEG,
  statorCurrentLimit: 60,
  calcVoltage: 11,
  measuredKs: 0,
  encoder: 'internal',
  cancoderToArmRatio: 1,
}
