import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeFeedforward, kPFromVoltsPerCm } from '../src/core/feedforward'
import { DEFAULT_MECHANISM, type ParameterSet } from '../src/schema/parameterSet'
import { phoenix6_2026, toRobotConfig } from '../src/core/codegen'

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
