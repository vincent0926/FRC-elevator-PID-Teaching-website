import { describe, expect, it } from 'vitest'
import { computeFlywheelFeedforward, DEFAULT_FLYWHEEL, DEFAULT_KNOBS, DEFAULT_PLAN, theoryGains } from '../flywheel/flywheel'
import { flywheelJava, flywheelToRotations, MOVE_SHOT_USAGE, moveShotJava } from './flywheel'

const TAU = 2 * Math.PI
const g = theoryGains(computeFlywheelFeedforward(DEFAULT_FLYWHEEL))

describe('飛輪轉數制輸出', () => {
  it('kS 不變，其他乘 2π', () => {
    const r = flywheelToRotations({ ...g, kS: 0.2, kI: 0.1, kD: 0.01 })
    expect(r.kS).toBe(0.2)
    expect(r.kV).toBeCloseTo(g.kV * TAU, 12)
    expect(r.kP).toBeCloseTo(0.2, 12)
    expect(r.kI).toBeCloseTo(0.1 * TAU, 12)
  })

  it('VelocityVoltage：目標 rps、PeakReverseVoltage、電流限制都寫出來', () => {
    const java = flywheelJava(g, DEFAULT_FLYWHEEL, DEFAULT_KNOBS, DEFAULT_PLAN)
    expect(java).toContain('new VelocityVoltage(0)')
    expect(java).toContain('request.withVelocity(50.0)')
    expect(java).toContain('config.Slot0.kV = 0.119344;')
    expect(java).toContain('config.Voltage.PeakReverseVoltage = 0.0;')
    expect(java).toContain('config.CurrentLimits.StatorCurrentLimit = 80.0;')
    expect(java).not.toContain('MotionMagicAcceleration')
  })

  it('有加速度限制就改用 MotionMagicVelocityVoltage', () => {
    const java = flywheelJava(g, DEFAULT_FLYWHEEL, { ...DEFAULT_KNOBS, noReverse: false, statorLimit: 0 }, { ...DEFAULT_PLAN, accel: 100 * TAU })
    expect(java).toContain('new MotionMagicVelocityVoltage(0)')
    expect(java).toContain('MotionMagicAcceleration = 100.0;')
    expect(java).not.toContain('PeakReverseVoltage')
    expect(java).not.toContain('StatorCurrentLimit')
  })
})

describe('邊移動邊射的 Java', () => {
  const plan = { ...DEFAULT_PLAN, angle: (45.3 * Math.PI) / 180, goalDistance: 3 }
  const java = moveShotJava(DEFAULT_FLYWHEEL, plan, 90 * TAU, 0.04)

  it('常數照選好的軌跡寫', () => {
    expect(java).toContain('TURRET_ANGLE = 134.7;')
    expect(java).toContain('PITCH = Math.toRadians(180.0 - TURRET_ANGLE)')
    expect(java).toContain(`SHOOTER_HEIGHT = ${DEFAULT_PLAN.height}`)
    expect(java).toContain('MAX_RPS = 90.0')
    expect(java).toContain('RPS_TOLERANCE = 0.02')
    expect(moveShotJava(DEFAULT_FLYWHEEL, plan, 90 * TAU, null)).toContain('RPS_TOLERANCE = 0.02')
    expect(MOVE_SHOT_USAGE).toContain('ShootOnTheMove.solve(distance, toward, side)')
  })
})
