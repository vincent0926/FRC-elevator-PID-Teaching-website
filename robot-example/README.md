# 機器人端範例程式

電梯子系統的範例，照隊上的 IO 架構寫（AdvantageKit + Phoenix 6 + 指令式架構）。
不是完整專案：把 `src/main/` 底下的檔案複製進隊上的機器人專案使用。

| 檔案 | 用途 |
|---|---|
| `ElevatorIO.java` | 硬體介面。`ElevatorIOInputs` 的欄位名稱就是網站欄位對應認得的名稱 |
| `ElevatorIOTalonFX.java` | TalonFX 實作：MotionMagicVoltage、電流限制、軟體上下限、往下用 Slot 1；Slot 0 參數可用 LoggedTunableNumber 即時調 |
| `util/LoggedTunableNumber.java` | 在 AdvantageScope / Elastic 即時改的數字（`/Tuning/…`）；比賽前把 `TUNING_MODE` 改成 false |
| `Elevator.java` | 子系統：跟隨誤差過大或失速時自動停止；`tuningRoutine()` 錄調參日誌用；`sysIdQuasistatic()`、`sysIdDynamic()` 跑 SysId（單元二） |
| `ElevatorGains.java` | **由網站產生**（1F「下載 Java」），進版本控制，是參數的最終依據 |
| `ElevatorGainsLoader.java` | 讀 `deploy/elevator-gains.json` 覆寫參數；缺欄位時警告並用 `ElevatorGains` 的值，不會讀成 0 |
| `deploy/elevator-gains.json` | **由網站產生**（1F「下載 JSON 設定檔」），不想重新編譯時用 |

## SysId 按鍵綁定（只放在測試分支）

```java
controller.povUp().whileTrue(elevator.sysIdQuasistatic(SysIdRoutine.Direction.kForward));
controller.povDown().whileTrue(elevator.sysIdQuasistatic(SysIdRoutine.Direction.kReverse));
controller.povRight().whileTrue(elevator.sysIdDynamic(SysIdRoutine.Direction.kForward));
controller.povLeft().whileTrue(elevator.sysIdDynamic(SysIdRoutine.Direction.kReverse));
```

`Elevator.java` 的 `SYSID_MIN_METERS`、`SYSID_MAX_METERS` 依行程修改，接近時測試自動停。

## 需要

- WPILib 2026、Phoenix 6（2026）、AdvantageKit（含 `@AutoLog` 註解處理器）
- 單位：程式裡的長度一律是公尺（鼓輪線位移），`ElevatorGains.METERS_PER_ROTATION` 負責跟轉數換算

## 使用前一定要改

- `ElevatorIOTalonFX` 裡的 CAN ID、CAN bus 名稱、電流限制、行程上下限
- 馬達方向（`Inverted`）與跟隨方向（`MotorAlignmentValue`）：照網站 4F 單元零第 2 步確認
- 上機前做完單元零；程式的保護不能取代 Driver Station 的 Disable 與急停

## 日誌欄位

AdvantageKit 會把 `Logger.processInputs("Elevator", inputs)` 記成 `/Elevator/PositionMeters` 這種名稱，
網站匯入時會自動對應，倍率保持 1。回授輸出是 TalonFX 的 P、I、D 三項相加，前饋輸出是閉迴路總輸出減回授。

> 注意：`ElevatorGains.java` 和 `elevator-gains.json` 由網站的程式碼範本產生，網站的單元測試會檢查兩者一致。
> 改範本後執行 `UPDATE_ROBOT_EXAMPLE=1 npm test` 重新產生。
