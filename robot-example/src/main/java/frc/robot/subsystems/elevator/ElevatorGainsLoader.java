package frc.robot.subsystems.elevator;

import com.ctre.phoenix6.configs.MotionMagicConfigs;
import com.ctre.phoenix6.configs.Slot0Configs;
import com.ctre.phoenix6.configs.Slot1Configs;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.wpi.first.wpilibj.Alert;
import edu.wpi.first.wpilibj.Alert.AlertType;
import edu.wpi.first.wpilibj.Filesystem;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.function.DoubleConsumer;

/**
 * 讀 deploy/elevator-gains.json（網站「下載 JSON 設定檔」產生）。
 *
 * <p>規則：程式碼裡的 {@link ElevatorGains} 是預設值，也是最終依據。JSON 有的欄位覆寫它，
 * 缺的欄位保留預設值並在 Dashboard 警告——絕對不默默讀成 0。
 * 檔案不存在就完全用 ElevatorGains，不算錯誤。
 */
public final class ElevatorGainsLoader {
  private ElevatorGainsLoader() {}

  /** slot1 為 null 表示沒有使用往下的 Slot。 */
  public record Loaded(Slot0Configs slot0, Slot1Configs slot1, MotionMagicConfigs motionMagic) {}

  private static final Alert missingFields = new Alert("", AlertType.kWarning);
  private static final Alert badFile = new Alert("", AlertType.kError);

  public static Loaded load() {
    Loaded fallback = new Loaded(ElevatorGains.slot0(), ElevatorGains.slot1(), ElevatorGains.motionMagic());
    File file = new File(Filesystem.getDeployDirectory(), "elevator-gains.json");
    if (!file.exists()) return fallback;

    try {
      JsonNode root = new ObjectMapper().readTree(file);
      if (root.path("schemaVersion").asInt(-1) != 1) return reject("schemaVersion 不是 1", fallback);
      if (!"phoenix6-rotations".equals(root.path("units").asText())) return reject("單位不是 phoenix6-rotations", fallback);
      double ratio = root.path("sensorToMechanismRatio").asDouble(Double.NaN);
      if (Double.isNaN(ratio) || Math.abs(ratio - ElevatorGains.GEAR_RATIO) > 1e-6) {
        return reject("齒比 " + ratio + " 跟程式碼的 " + ElevatorGains.GEAR_RATIO + " 不同（機構改了？重新產生 Java）", fallback);
      }

      List<String> missing = new ArrayList<>();
      Slot0Configs s0 = ElevatorGains.slot0();
      JsonNode j0 = root.path("slot0");
      read(j0, "kS", v -> s0.kS = v, "slot0", missing);
      read(j0, "kG", v -> s0.kG = v, "slot0", missing);
      read(j0, "kV", v -> s0.kV = v, "slot0", missing);
      read(j0, "kA", v -> s0.kA = v, "slot0", missing);
      read(j0, "kP", v -> s0.kP = v, "slot0", missing);
      read(j0, "kI", v -> s0.kI = v, "slot0", missing);
      read(j0, "kD", v -> s0.kD = v, "slot0", missing);

      Slot1Configs s1 = null;
      if (root.has("slot1")) {
        // Slot 1 缺的欄位沿用剛讀好的 Slot 0，而不是 0
        Slot1Configs t = copyToSlot1(s0);
        JsonNode j1 = root.path("slot1");
        read(j1, "kS", v -> t.kS = v, "slot1", missing);
        read(j1, "kG", v -> t.kG = v, "slot1", missing);
        read(j1, "kV", v -> t.kV = v, "slot1", missing);
        read(j1, "kA", v -> t.kA = v, "slot1", missing);
        read(j1, "kP", v -> t.kP = v, "slot1", missing);
        read(j1, "kI", v -> t.kI = v, "slot1", missing);
        read(j1, "kD", v -> t.kD = v, "slot1", missing);
        s1 = t;
      }

      MotionMagicConfigs mm = ElevatorGains.motionMagic();
      JsonNode jm = root.path("motionMagic");
      read(jm, "cruiseVelocity", v -> mm.MotionMagicCruiseVelocity = v, "motionMagic", missing);
      read(jm, "acceleration", v -> mm.MotionMagicAcceleration = v, "motionMagic", missing);

      if (!missing.isEmpty()) {
        missingFields.setText("elevator-gains.json 缺少 " + String.join("、", missing) + "，這些欄位用程式碼裡的預設值");
        missingFields.set(true);
      }
      return new Loaded(s0, s1, mm);
    } catch (Exception e) {
      return reject("讀取失敗（" + e.getMessage() + "）", fallback);
    }
  }

  private static Loaded reject(String why, Loaded fallback) {
    badFile.setText("elevator-gains.json " + why + "，忽略整個檔案，使用程式碼裡的參數");
    badFile.set(true);
    return fallback;
  }

  private static Slot1Configs copyToSlot1(Slot0Configs s) {
    Slot1Configs t = new Slot1Configs();
    t.kS = s.kS;
    t.kG = s.kG;
    t.kV = s.kV;
    t.kA = s.kA;
    t.kP = s.kP;
    t.kI = s.kI;
    t.kD = s.kD;
    t.GravityType = s.GravityType;
    t.StaticFeedforwardSign = s.StaticFeedforwardSign;
    return t;
  }

  private static void read(JsonNode node, String key, DoubleConsumer set, String group, List<String> missing) {
    JsonNode v = node.get(key);
    if (v == null || !v.isNumber() || !Double.isFinite(v.asDouble())) {
      missing.add(group + "." + key);
      return;
    }
    set.accept(v.asDouble());
  }
}
