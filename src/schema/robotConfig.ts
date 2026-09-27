import { z } from 'zod'

/**
 * 放在機器人 deploy 資料夾的 JSON 設定檔（src/main/deploy/elevator-gains.json）。
 * 單位已換成 Phoenix 6 轉數制，機器人端直接塞進 Slot0Configs。
 * 機器人端讀不到某個欄位時，要在 Dashboard 警告並用程式碼裡的預設值，不可默默讀成 0。
 */

const Slot = z.object({
  kS: z.number(),
  kG: z.number(),
  kV: z.number(),
  kA: z.number(),
  kP: z.number(),
  kI: z.number(),
  kD: z.number(),
})

export const RobotConfigSchema = z.object({
  schemaVersion: z.literal(1),
  generator: z.string(),
  generatedAt: z.string(),
  source: z.enum(['theory', 'tuning', 'custom', 'measured']),
  units: z.literal('phoenix6-rotations'),
  sensorToMechanismRatio: z.number().positive(),
  metersPerRotation: z.number().positive(),
  slot0: Slot,
  /** 摩擦不對稱時往下用 Slot 1 */
  slot1: Slot.optional(),
  motionMagic: z.object({
    cruiseVelocity: z.number().positive(), // rps
    acceleration: z.number().positive(), // rps/s
  }),
})

export type RobotConfig = z.infer<typeof RobotConfigSchema>
export type RobotSlot = z.infer<typeof Slot>

/**
 * 手臂的 deploy 設定檔（src/main/deploy/arm-gains.json）。位置單位是「手臂轉幾圈」，0 = 水平。
 * 齒比與角度感測器跟程式碼不同時，機器人端要忽略整個檔案（機構改了要重新產生 Java）。
 */
export const ArmRobotConfigSchema = z.object({
  schemaVersion: z.literal(1),
  generator: z.string(),
  generatedAt: z.string(),
  source: z.enum(['theory', 'tuning', 'custom', 'measured']),
  mechanism: z.literal('arm'),
  units: z.literal('phoenix6-rotations'),
  /** 馬達圈數 : 手臂 1 圈 */
  gearRatio: z.number().positive(),
  encoder: z.enum(['internal', 'cancoder']),
  cancoderToArmRatio: z.number().positive(),
  slot0: Slot,
  motionMagic: z.object({
    cruiseVelocity: z.number().positive(), // 手臂 rps
    acceleration: z.number().positive(), // 手臂 rps/s
  }),
})

export type ArmRobotConfig = z.infer<typeof ArmRobotConfigSchema>
