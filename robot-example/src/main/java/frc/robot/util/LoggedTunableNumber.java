package frc.robot.util;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.DoubleSupplier;
import org.littletonrobotics.junction.networktables.LoggedNetworkNumber;

/**
 * 可以在 AdvantageScope 或 Elastic 即時修改的數字（4F 單元一）。
 *
 * <p>數值放在 NetworkTables 的 /Tuning/ 底下，改動會被 AdvantageKit 記進日誌，事後看得到哪一段用了哪個值。
 * 比賽時把 {@link #TUNING_MODE} 設成 false：數值固定在預設值，Dashboard 改不到。
 *
 * <p>這裡改的數字重開機就沒了。調好之後要回網站產生 ElevatorGains.java 並 commit，程式碼才是最終依據。
 */
public class LoggedTunableNumber implements DoubleSupplier {
  /** 比賽前改成 false */
  public static final boolean TUNING_MODE = true;

  private static final String TABLE = "/Tuning";

  private final double defaultValue;
  private final LoggedNetworkNumber dashboardNumber;
  private final Map<Integer, Double> lastValues = new HashMap<>();

  public LoggedTunableNumber(String key, double defaultValue) {
    this.defaultValue = defaultValue;
    this.dashboardNumber = TUNING_MODE ? new LoggedNetworkNumber(TABLE + "/" + key, defaultValue) : null;
  }

  public double get() {
    return dashboardNumber == null ? defaultValue : dashboardNumber.get();
  }

  @Override
  public double getAsDouble() {
    return get();
  }

  /** 從上次用同一個 id 呼叫以來，數值有沒有變。第一次呼叫回傳 true。 */
  public boolean hasChanged(int id) {
    double value = get();
    Double last = lastValues.get(id);
    if (last == null || value != last) {
      lastValues.put(id, value);
      return true;
    }
    return false;
  }

  /** 任何一個數字變了，就把全部目前的值交給 action（例如重新套用 Slot 設定）。 */
  public static void ifChanged(int id, Consumer<double[]> action, LoggedTunableNumber... numbers) {
    boolean changed = false;
    for (LoggedTunableNumber n : numbers) {
      changed |= n.hasChanged(id); // 每個都要呼叫，不能短路
    }
    if (changed) action.accept(Arrays.stream(numbers).mapToDouble(LoggedTunableNumber::get).toArray());
  }
}
