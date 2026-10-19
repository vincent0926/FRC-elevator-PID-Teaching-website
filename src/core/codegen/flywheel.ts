import { EXIT_RATIO, exitRadius, type FlywheelGains, type FlywheelKnobs, type FlywheelMechanism, type ShotPlan } from '../flywheel/flywheel'
import { jd } from './index'

/**
 * 射球飛輪的 Phoenix 6 設定片段。SensorToMechanismRatio = 齒比，所以速度單位是「飛輪每秒轉幾圈」（rps），
 * 增益從 SI（rad/s）換成 rps 都是乘 2π。
 */

const TAU = 2 * Math.PI

export interface FlywheelRotGains {
  kS: number
  kV: number
  kA: number
  kP: number
  kI: number
  kD: number
}

/** SI → Phoenix 6 轉數制：kS 是伏特不變，其他乘 2π（V/(rad/s) → V/rps、V/rad → V/rot…） */
export function flywheelToRotations(g: FlywheelGains): FlywheelRotGains {
  return { kS: g.kS, kV: g.kV * TAU, kA: g.kA * TAU, kP: g.kP * TAU, kI: g.kI * TAU, kD: g.kD * TAU }
}

export function flywheelJava(g: FlywheelGains, mech: FlywheelMechanism, knobs: FlywheelKnobs, plan: ShotPlan): string {
  const r = flywheelToRotations(g)
  const magic = plan.accel > 0
  const lines = [
    '// 射球飛輪（Phoenix 6）：速度單位是飛輪的 rps',
    'var config = new TalonFXConfiguration();',
    `config.Feedback.SensorToMechanismRatio = ${jd(mech.gearRatio)}; // 馬達轉幾圈飛輪轉 1 圈`,
    `config.Slot0.kS = ${jd(r.kS)}; // V`,
    `config.Slot0.kV = ${jd(r.kV)}; // V/rps`,
    `config.Slot0.kA = ${jd(r.kA)}; // V/(rps/s)`,
    `config.Slot0.kP = ${jd(r.kP)}; // V/rps`,
    `config.Slot0.kI = ${jd(r.kI)}; // V/rot`,
    `config.Slot0.kD = ${jd(r.kD)}; // V/(rps/s)`,
  ]
  if (magic) lines.push(`config.MotionMagic.MotionMagicAcceleration = ${jd(plan.accel / TAU)}; // rps/s`)
  if (knobs.noReverse) lines.push('config.Voltage.PeakReverseVoltage = 0.0; // 不出反向電壓，掉速時不會反過來煞車')
  if (knobs.statorLimit > 0) {
    lines.push(`config.CurrentLimits.StatorCurrentLimit = ${jd(knobs.statorLimit)}; // A`)
    lines.push('config.CurrentLimits.StatorCurrentLimitEnable = true;')
  }
  lines.push('shooter.getConfigurator().apply(config);')
  if (mech.motorCount > 1) lines.push('// 其他馬達設成 Follower（方向相反的話用 MotorAlignmentValue.Opposed）')
  lines.push('')
  lines.push(
    magic
      ? 'private final MotionMagicVelocityVoltage request = new MotionMagicVelocityVoltage(0).withSlot(0);'
      : 'private final VelocityVoltage request = new VelocityVoltage(0).withSlot(0);',
  )
  lines.push(`shooter.setControl(request.withVelocity(${jd(plan.target / TAU)})); // 目標 rps`)
  return lines.join('\n')
}

/**
 * 邊移動邊射（決策 129）：把 core/flywheel 的 solveMovingShot 翻成 Java，常數用 1F 選好的那條軌跡。
 * 解法和網站一樣（二分法找球速，不計空氣阻力），單位：距離 m、速度 m/s、轉速是飛輪 rps、角度 rad。
 */
export function moveShotJava(mech: FlywheelMechanism, plan: ShotPlan, maxWheel: number, tolerance: number | null): string {
  const mpsPerRps = EXIT_RATIO * exitRadius(mech) * TAU
  const pitchDeg = Math.round(((plan.angle * 180) / Math.PI) * 10) / 10
  // 轉速可以差多少：用這條軌跡容許誤差的一半當起點，算不出來就 2%
  const rpsTol = tolerance === null ? 0.02 : Math.max(0.005, tolerance / 2)
  return `// 邊移動邊射（elevator-tuner 產生）：發射機構仰角固定、沒有砲塔，左右靠底盤轉
// 不計空氣阻力、假設球不打滑：上機射幾發，球一直偏近就把 MPS_PER_RPS 調小，偏遠就調大
public final class ShootOnTheMove {
  /** 發射機構的仰角（相對機器人） */
  public static final double PITCH = Math.toRadians(${jd(pitchDeg)});
  /** 出射點離地高度 m */
  public static final double SHOOTER_HEIGHT = ${jd(Math.max(0, plan.height))};
  /** 目標高度 m、開口寬度 m */
  public static final double GOAL_HEIGHT = ${jd(plan.goalHeight)};
  public static final double GOAL_WIDTH = ${jd(plan.goalWidth)};
  /** 飛輪每 1 rps，球離開機器人的速度 m/s（= 0.5 × 2π × 換算半徑） */
  public static final double MPS_PER_RPS = ${jd(mpsPerRps)};
  /** 轉速上限 rps：要的轉速超過就不射 */
  public static final double MAX_RPS = ${jd(maxWheel / TAU)};
  /** 實際轉速和目標差在這個比例內才送球 */
  public static final double RPS_TOLERANCE = ${jd(rpsTol)};
  private static final double G = 9.81;

  /** rps：飛輪目標轉速；yaw：底盤從「正對目標」再往左轉幾 rad（往右是負的） */
  public record Shot(double rps, double yaw) {}

  /**
   * distance：出射點到目標中心的水平距離 m
   * toward：機器人往目標方向的速度 m/s（靠近是正的）
   * side：側向速度 m/s（面向目標時往左是正的）
   * 打不進（太近、太遠、開太快、轉速超過上限）回傳 null
   */
  public static Shot solve(double distance, double toward, double side) {
    double c = Math.cos(PITCH);
    double s = Math.sin(PITCH);
    if (distance <= 0 || c <= 1e-6 || s <= 1e-6) return null;
    double rise = GOAL_HEIGHT - SHOOTER_HEIGHT;
    // 最小球速：要能抵銷側向速度、要打得到目標高度
    double lo = Math.max(Math.abs(side) / c, Math.sqrt(2 * G * Math.max(0, rise)) / s) * (1 + 1e-12) + 1e-9;
    if (range(lo, toward, side, rise) > distance) return null;
    double hi = lo * 2 + 1;
    while (!(range(hi, toward, side, rise) >= distance)) {
      hi *= 2;
      if (hi > 1e4) return null;
    }
    // 二分法：射程隨球速變大，找剛好打到目標中心的球速
    for (int i = 0; i < 100; i++) {
      double mid = (lo + hi) / 2;
      if (range(mid, toward, side, rise) >= distance) hi = mid;
      else lo = mid;
    }
    double q = hi * c;
    double forward = Math.sqrt(Math.max(0, q * q - side * side));
    double h = forward + toward;
    double vz = hi * s;
    // 球要往下掉進去：最高點要在目標前面
    if (h <= 0 || h * vz / G > distance + 1e-9) return null;
    double rps = hi / MPS_PER_RPS;
    if (rps > MAX_RPS) return null;
    return new Shot(rps, Math.atan2(-side, forward));
  }

  /** 底盤角度差在這個範圍內才送球 rad：球偏開口半徑的一半 */
  public static double aimTolerance(double distance) {
    return Math.atan2(GOAL_WIDTH / 4, distance);
  }

  /** 球速 vs 時，球對地往目標飛多遠才往下掉經過目標高度；打不到那個高度是 NaN */
  private static double range(double vs, double toward, double side, double rise) {
    double q = vs * Math.cos(PITCH);
    double h = Math.sqrt(Math.max(0, q * q - side * side)) + toward;
    double vz = vs * Math.sin(PITCH);
    double disc = vz * vz - 2 * G * rise;
    if (disc < 0) return Double.NaN;
    return h * (vz + Math.sqrt(disc)) / G;
  }
}`
}

/** 邊移動邊射：每個週期在 Command 的 execute() 裡做的事（底盤、送球的方法換成你們自己的） */
export const MOVE_SHOT_USAGE = `// 1. 讀機器人的位置和速度（換成你們底盤的方法）
Pose2d pose = drive.getPose();
ChassisSpeeds robot = drive.getRobotRelativeSpeeds();
ChassisSpeeds field = ChassisSpeeds.fromRobotRelativeSpeeds(robot, pose.getRotation());

// 2. 拆成「往目標」和「側向」的速度
// GOAL：目標中心的場地座標（照場地手冊填，紅藍方不一樣）
Translation2d toGoal = GOAL.minus(pose.getTranslation());
double distance = toGoal.getNorm();
Rotation2d facing = toGoal.getAngle(); // 正對目標的方向
double ux = facing.getCos();
double uy = facing.getSin();
double toward = field.vxMetersPerSecond * ux + field.vyMetersPerSecond * uy;
double side = -field.vxMetersPerSecond * uy + field.vyMetersPerSecond * ux;

// 3. 算轉速和底盤偏角
ShootOnTheMove.Shot shot = ShootOnTheMove.solve(distance, toward, side);
if (shot == null) {
  feeder.stop(); // 這個距離和速度打不進：不送球
  return;
}
shooter.setControl(velocityRequest.withVelocity(shot.rps()));
// 發射機構朝車尾的話，heading 再加 180°
Rotation2d heading = facing.plus(Rotation2d.fromRadians(shot.yaw()));
// 平移照駕駛的搖桿，只有車頭方向交給程式（CTRE swerve 的 FieldCentricFacingAngle）
drive.setControl(faceAngle.withVelocityX(driverX).withVelocityY(driverY).withTargetDirection(heading));

// 4. 轉速到了、車頭對了才送球
double rps = shooter.getVelocity().getValueAsDouble();
boolean speedOk = Math.abs(rps - shot.rps()) <= shot.rps() * ShootOnTheMove.RPS_TOLERANCE;
boolean aimOk = Math.abs(pose.getRotation().minus(heading).getRadians()) <= ShootOnTheMove.aimTolerance(distance);
if (speedOk && aimOk) feeder.feed();
else feeder.stop();`
