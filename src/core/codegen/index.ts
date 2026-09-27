import type { ParameterSet } from '../../schema/parameterSet'
import type { RobotConfig, RobotSlot } from '../../schema/robotConfig'
import { linearToRotations, metersPerRotation, siToRotations } from '../units'

/**
 * 換算只在這裡做：參數組（SI、鼓輪座標）→ Phoenix 6 轉數制。
 *
 * 增益用鼓輪 1 圈 = 2πr 換算。機構座標若定為最上層高度，增益的轉數制數值不變
 * （同樣是鼓輪轉 1 圈），只有「位置 ↔ 公尺」的換算要多乘最上層速度比。
 */

export const GENERATOR = 'elevator-tuner'

export interface Converted {
  sensorToMechanismRatio: number
  /** 鼓輪 1 圈的線位移（增益換算用） */
  drumMetersPerRotation: number
  /** 機構座標 1 圈的公尺數（位置換算用） */
  metersPerRotation: number
  slot0: RobotSlot
  slot1?: RobotSlot
  cruiseVelocity: number
  acceleration: number
}

export function convert(ps: ParameterSet): Converted {
  const m = ps.mechanism
  const drum = metersPerRotation(m.drumRadius)
  const kTop = m.stages[m.stages.length - 1]?.speedRatio ?? 1
  const base = { ...ps.feedforward, ...ps.feedback }
  const up = ps.slotByDirection ? { ...base, ...ps.slotByDirection.up } : base
  const slot0 = siToRotations(up, drum)
  const slot1 = ps.slotByDirection ? siToRotations({ ...base, ...ps.slotByDirection.down }, drum) : undefined
  return {
    sensorToMechanismRatio: m.gearRatio,
    drumMetersPerRotation: drum,
    metersPerRotation: m.controlTop ? drum * kTop : drum,
    slot0,
    slot1,
    cruiseVelocity: linearToRotations(ps.motionMagic.cruiseVelocity, drum),
    acceleration: linearToRotations(ps.motionMagic.acceleration, drum),
  }
}

export function toRobotConfig(ps: ParameterSet, now = new Date()): RobotConfig {
  const c = convert(ps)
  return {
    schemaVersion: 1,
    generator: GENERATOR,
    generatedAt: now.toISOString(),
    source: ps.source,
    units: 'phoenix6-rotations',
    sensorToMechanismRatio: c.sensorToMechanismRatio,
    metersPerRotation: c.metersPerRotation,
    slot0: c.slot0,
    ...(c.slot1 ? { slot1: c.slot1 } : {}),
    motionMagic: { cruiseVelocity: c.cruiseVelocity, acceleration: c.acceleration },
  }
}

/** Java 的 double 字面值：有效數字 6 位，避免 1e-5 這類寫法讓隊員看不懂 */
export function jd(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`無法輸出非有限數值：${v}`)
  if (v === 0) return '0.0'
  const s = Number(v.toPrecision(6)).toString()
  if (/e/i.test(s)) return v.toFixed(10).replace(/0+$/, '0')
  return s.includes('.') ? s : `${s}.0`
}

export interface JavaTemplate {
  id: string
  label: string
  render(ps: ParameterSet, now?: Date): string
}

const SOURCE_LABEL: Record<ParameterSet['source'], string> = {
  theory: '理論值',
  tuning: '調參建議值',
  custom: '自訂',
  measured: '實測值',
}

function slotJava(name: string, g: RobotSlot): string {
  return `  public static Slot${name === 'slot0' ? '0' : '1'}Configs ${name}() {
    return new Slot${name === 'slot0' ? '0' : '1'}Configs()
        .withKS(${jd(g.kS)})
        .withKG(${jd(g.kG)})
        .withKV(${jd(g.kV)})
        .withKA(${jd(g.kA)})
        .withKP(${jd(g.kP)})
        .withKI(${jd(g.kI)})
        .withKD(${jd(g.kD)})
        .withGravityType(GravityTypeValue.Elevator_Static)
        .withStaticFeedforwardSign(StaticFeedforwardSignValue.UseVelocitySign);
  }`
}

export const phoenix6_2026: JavaTemplate = {
  id: 'phoenix6-2026',
  label: 'Phoenix 6（2026 賽季）',
  render(ps, now = new Date()) {
    const c = convert(ps)
    const imports = [
      'com.ctre.phoenix6.configs.MotionMagicConfigs',
      'com.ctre.phoenix6.configs.Slot0Configs',
      'com.ctre.phoenix6.configs.Slot1Configs',
      'com.ctre.phoenix6.signals.GravityTypeValue',
      'com.ctre.phoenix6.signals.StaticFeedforwardSignValue',
    ]
    return `package frc.robot.subsystems.elevator;

${imports.map((i) => `import ${i};`).join('\n')}

/**
 * 由電梯調參工作站產生：${SOURCE_LABEL[ps.source]}，${now.toISOString()}。
 * 單位：Phoenix 6 轉數制（SensorToMechanismRatio = GEAR_RATIO，機構 1 圈 = 鼓輪 1 圈）。
 * 這個檔案進版本控制，是參數的最終依據；網頁上改的數字要重新產生並 commit 才算數。
 */
public final class ElevatorGains {
  private ElevatorGains() {}

  public static final double GEAR_RATIO = ${jd(c.sensorToMechanismRatio)};
  /** 機構座標 1 圈的公尺數${ps.mechanism.controlTop ? '（最上層高度）' : '（鼓輪線位移）'} */
  public static final double METERS_PER_ROTATION = ${jd(c.metersPerRotation)};

  /** Motion Magic 巡航速度（rps）＝ ${jd(ps.motionMagic.cruiseVelocity)} m/s */
  public static final double CRUISE_VELOCITY = ${jd(c.cruiseVelocity)};
  /** Motion Magic 加速度（rps/s）＝ ${jd(ps.motionMagic.acceleration)} m/s² */
  public static final double ACCELERATION = ${jd(c.acceleration)};

${slotJava('slot0', c.slot0)}

  /** 往下移動用 Slot 1（摩擦不對稱時）；null 表示上下共用 Slot 0 */
${c.slot1 ? slotJava('slot1', c.slot1) : '  public static Slot1Configs slot1() {\n    return null;\n  }'}

  public static MotionMagicConfigs motionMagic() {
    return new MotionMagicConfigs()
        .withMotionMagicCruiseVelocity(CRUISE_VELOCITY)
        .withMotionMagicAcceleration(ACCELERATION);
  }
}
`
  },
}

/** 每年新增一份範本，舊的保留給還沒升級的專案 */
export const JAVA_TEMPLATES: JavaTemplate[] = [phoenix6_2026]
