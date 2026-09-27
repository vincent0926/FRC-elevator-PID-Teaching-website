import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeFeedforward, kPFromVoltsPerCm } from '../src/core/feedforward'
import { DEFAULT_MECHANISM, type ParameterSet } from '../src/schema/parameterSet'
import { phoenix6_2026, toRobotConfig } from '../src/core/codegen'
import { renderArmGains, toArmRobotConfig } from '../src/core/codegen/arm'
import { computeArmFeedforward, kPFromVoltsPerDeg } from '../src/core/arm/feedforward'
import { DEFAULT_ARM, type ArmParameterSet } from '../src/schema/armParameterSet'

/**
 * robot-example/ 裡的 ElevatorGains.java 與 elevator-gains.json 由範本產生，這個測試確保兩邊一致。
 * 範本改了之後執行 `UPDATE_ROBOT_EXAMPLE=1 npm test` 重新產生。
 */

const DIR = new URL('../robot-example/src/main/', import.meta.url)
const JAVA = new URL('java/frc/robot/subsystems/elevator/ElevatorGains.java', DIR)
const JSON_FILE = new URL('deploy/elevator-gains.json', DIR)
const NOW = new Date('2026-09-27T00:00:00.000Z')

const ff = computeFeedforward(DEFAULT_MECHANISM)
const theory: ParameterSet = {
  schemaVersion: 1,
  source: 'theory',
  createdAt: NOW.toISOString(),
  mechanism: DEFAULT_MECHANISM,
  feedforward: { kS: 0, kG: ff.kG, kV: ff.kV, kA: ff.kA },
  feedback: { kP: kPFromVoltsPerCm(0.5), kI: 0, kD: 0 },
  motionMagic: { cruiseVelocity: ff.cruiseVelocity, acceleration: ff.acceleration },
}

describe('robot-example 與範本同步', () => {
  const java = phoenix6_2026.render(theory, NOW)
  const json = JSON.stringify(toRobotConfig(theory, NOW), null, 2) + '\n'
  if (process.env.UPDATE_ROBOT_EXAMPLE) {
    writeFileSync(JAVA, java)
    writeFileSync(JSON_FILE, json)
  }
  it('ElevatorGains.java', () => expect(readFileSync(JAVA, 'utf8')).toBe(java))
  it('elevator-gains.json', () => expect(readFileSync(JSON_FILE, 'utf8')).toBe(json))
})

const ARM_JAVA = new URL('java/frc/robot/subsystems/arm/ArmGains.java', DIR)
const ARM_JSON = new URL('deploy/arm-gains.json', DIR)
const aff = computeArmFeedforward(DEFAULT_ARM)
const armTheory: ArmParameterSet = {
  schemaVersion: 1,
  source: 'theory',
  createdAt: NOW.toISOString(),
  mechanism: DEFAULT_ARM,
  feedforward: { kS: 0, kG: aff.kG, kV: aff.kV, kA: aff.kA },
  feedback: { kP: kPFromVoltsPerDeg(0.3), kI: 0, kD: 0 },
  motionMagic: { cruiseVelocity: aff.cruiseVelocity, acceleration: aff.acceleration },
}

describe('robot-example 手臂與範本同步', () => {
  const java = renderArmGains(armTheory, NOW)
  const json = JSON.stringify(toArmRobotConfig(armTheory, NOW), null, 2) + '\n'
  if (process.env.UPDATE_ROBOT_EXAMPLE) {
    writeFileSync(ARM_JAVA, java)
    writeFileSync(ARM_JSON, json)
  }
  it('ArmGains.java', () => expect(readFileSync(ARM_JAVA, 'utf8')).toBe(java))
  it('arm-gains.json', () => expect(readFileSync(ARM_JSON, 'utf8')).toBe(json))
})
