package frc.robot.subsystems.elevator;

import com.ctre.phoenix6.configs.MotionMagicConfigs;
import com.ctre.phoenix6.configs.Slot0Configs;
import com.ctre.phoenix6.configs.Slot1Configs;
import com.ctre.phoenix6.signals.GravityTypeValue;
import com.ctre.phoenix6.signals.StaticFeedforwardSignValue;

/**
 * 由電梯調參工作站產生：理論值，2026-09-27T00:00:00.000Z。
 * 單位：Phoenix 6 轉數制（SensorToMechanismRatio = GEAR_RATIO，機構 1 圈 = 鼓輪 1 圈）。
 * 這個檔案進版本控制，是參數的最終依據；網頁上改的數字要重新產生並 commit 才算數。
 */
public final class ElevatorGains {
  private ElevatorGains() {}

  public static final double GEAR_RATIO = 5.0;
  /** 機構座標 1 圈的公尺數（鼓輪線位移） */
  public static final double METERS_PER_ROTATION = 0.120009;

  /** Motion Magic 巡航速度（rps）＝ 1.58265 m/s */
  public static final double CRUISE_VELOCITY = 13.1878;
  /** Motion Magic 加速度（rps/s）＝ 13.0261 m/s² */
  public static final double ACCELERATION = 108.543;

  public static Slot0Configs slot0() {
    return new Slot0Configs()
        .withKS(0.0)
        .withKG(0.507408)
        .withKV(0.596721)
        .withKA(0.0100868)
        .withKP(6.00044)
        .withKI(0.0)
        .withKD(0.0)
        .withGravityType(GravityTypeValue.Elevator_Static)
        .withStaticFeedforwardSign(StaticFeedforwardSignValue.UseVelocitySign);
  }

  /** 往下移動用 Slot 1（摩擦不對稱時）；null 表示上下共用 Slot 0 */
  public static Slot1Configs slot1() {
    return null;
  }

  public static MotionMagicConfigs motionMagic() {
    return new MotionMagicConfigs()
        .withMotionMagicCruiseVelocity(CRUISE_VELOCITY)
        .withMotionMagicAcceleration(ACCELERATION);
  }
}
