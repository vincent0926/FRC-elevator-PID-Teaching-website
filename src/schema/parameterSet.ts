import { z } from 'zod'

/**
 * 全網站唯一的參數格式。計算、調參建議、模擬都讀寫它。
 * 內部一律 SI 單位；轉數制只在 codegen/ 輸出時換算。
 */

export const MotorIdSchema = z.enum(['krakenX60', 'krakenX60Foc', 'falcon500', 'falcon500Foc', 'neo'])

export const StageSchema = z.object({
  /** 這一級移動的質量（kg） */
  mass: z.number().nonnegative(),
  /** 相對於鼓輪線速度的速度比（第一級 1、串級第二級 2…） */
  speedRatio: z.number().positive(),
})

export const ElevatorMechanismSchema = z.object({
  kind: z.literal('elevator'),
  name: z.string().default('電梯'),
  motor: MotorIdSchema,
  motorCount: z.number().int().min(1).max(4),
  /** 馬達圈數 : 鼓輪 1 圈 */
  gearRatio: z.number().positive(),
  /** 鼓輪或鏈輪節圓半徑（m） */
  drumRadius: z.number().positive(),
  rig: z.enum(['cascade', 'continuous']),
  stages: z.array(StageSchema).min(1).max(5),
  /** 遊戲物件等負載（kg），掛在最上層 */
  payloadMass: z.number().nonnegative(),
  /** 配重或定力彈簧向上的力（N） */
  counterweightForce: z.number().nonnegative(),
  /** 機構座標是否定為最上層高度（否則為鼓輪線位移，即第一級） */
  controlTop: z.boolean().default(false),
  statorCurrentLimit: z.number().positive(),
  /** 計算最大速度用的電壓（考慮電池壓降，通常 10–11 V） */
  calcVoltage: z.number().positive().max(13),
  /** 行程（m），機構座標 */
  travel: z.number().positive(),
  /** 上機量到的靜摩擦 kS（V）。公式算不出來；沒量過是 0，最高速度、加速度就是不含摩擦的理論上限 */
  measuredKs: z.number().nonnegative().max(6).default(0),
})

/**
 * 參數組中所有伏特前面的「理論值」都以「鼓輪線位移」為座標；
 * controlTop 時由 codegen 換算成最上層座標。
 */
export const ParameterSetSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.enum(['theory', 'tuning', 'custom', 'measured']),
  createdAt: z.string(),
  note: z.string().optional(),
  mechanism: ElevatorMechanismSchema,
  feedforward: z.object({ kS: z.number(), kG: z.number(), kV: z.number(), kA: z.number() }),
  feedback: z.object({ kP: z.number(), kI: z.number(), kD: z.number() }),
  motionMagic: z.object({ cruiseVelocity: z.number().positive(), acceleration: z.number().positive() }),
  slotByDirection: z
    .object({
      up: z.object({ kS: z.number(), kG: z.number() }),
      down: z.object({ kS: z.number(), kG: z.number() }),
    })
    .optional(),
})

export type MotorIdValue = z.infer<typeof MotorIdSchema>
export type Stage = z.infer<typeof StageSchema>
export type ElevatorMechanism = z.infer<typeof ElevatorMechanismSchema>
export type ParameterSet = z.infer<typeof ParameterSetSchema>
export type ParameterSource = ParameterSet['source']

export const DEFAULT_MECHANISM: ElevatorMechanism = {
  kind: 'elevator',
  name: '電梯',
  motor: 'krakenX60',
  motorCount: 2,
  gearRatio: 5,
  drumRadius: 0.0191,
  rig: 'cascade',
  stages: [
    { mass: 6, speedRatio: 1 },
    { mass: 4, speedRatio: 2 },
  ],
  payloadMass: 1,
  counterweightForce: 0,
  controlTop: false,
  statorCurrentLimit: 60,
  calcVoltage: 11,
  travel: 1.2,
  measuredKs: 0,
}

/** 讀入外部 JSON，失敗時回傳人看得懂的錯誤清單。 */
export function parseParameterSet(data: unknown): { ok: true; value: ParameterSet } | { ok: false; errors: string[] } {
  const r = ParameterSetSchema.safeParse(data)
  if (r.success) return { ok: true, value: r.data }
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(根)'}：${i.message}`) }
}
