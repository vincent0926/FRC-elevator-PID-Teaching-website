import { useMemo } from 'react'
import { makeArmSampleLog } from '../../core/arm/sampleLog'
import { TuningWorkspace } from '../tuning/TuningWorkspace'
import { ArmDiagnosisPanel } from './ArmDiagnosisPanel'
import { ARM_LOG_SCENARIOS } from './armLogScenarios'
import { useArm } from './armStore'
import { armGains } from './armTuning'
import { UnsavedNote } from './UnsavedNote'
import { GUIDE_ANCHOR } from '../guide/guideContent'
import { t } from '../../core/lang'

/**
 * 手臂 2F 調參建議：跟電梯同一個 TuningWorkspace（資料檢查 → 找問題 → 處理一個 → 上機驗證），
 * 差在重力項是 kG·cos θ、位置是角度。欄位對應跟電梯分開記；手臂沒有模型校正，不記 lastLog。
 */
export function ArmTuningPage() {
  const store = useArm()
  const { arm, ff, theory, custom } = store
  const fallbackGains = useMemo(() => armGains(custom ?? theory), [custom, theory])

  return (
    <TuningWorkspace
      kind="arm"
      idPrefix="arm-tune"
      helpSection={GUIDE_ANCHOR.tune}
      title={t('手臂・調參建議', 'Arm · Tuning advice')}
      lead={t('匯入手臂的實機日誌，先檢查資料能不能用，再看問題出在哪。一次只處理一個問題，改完再測。', 'Import a log from the arm, check the data is usable, then see where the problem is. Fix one problem at a time and test again after each change.')}
      banner={<UnsavedNote />}
      dropLabel={t('把手臂的 .wpilog 拖到這裡', 'Drop the arm’s .wpilog here')}
      dropNote={t('檔案只在這台電腦的瀏覽器裡解析，不會上傳。第一次匯入要設定欄位對應，之後自動套用。角度要是弧度、0 = 水平（範例程式的 ArmIO 就是）。', 'The file is parsed only in this browser and never uploaded. The first import needs a field mapping; after that it’s applied automatically. Angles must be in radians with 0 = horizontal (the example code’s ArmIO does this).')}
      simNote={t(
        <>
        這份是 <b>3F 模擬</b>出來的資料，不是實機日誌。拿來練習讀圖、看調參建議，數字以上機實測為準。診斷會直接用模擬時的參數當「機器人上當時的參數」。
        按「套用」後回 3F 選「自訂」，同樣的目標再跑一次，看問題有沒有消失。
        </>,
        <>
          This came from the <b>3F sim</b>, not a robot log. Use it to practice reading charts and the tuning advice; real numbers come from testing on the robot. The diagnosis uses the sim’s gains as “the gains on the robot at the time”.{' '}
          After pressing “Apply”, go back to 3F, pick “Custom” and run the same target again to see whether the problem is gone.
        </>,
      )}
      sampleNote={t('用模擬器產生一份跟範例程式（ArmIO）欄位相同的手臂日誌（50 Hz），拿來練習匯入和讀圖。資料是模擬的，不是實機。', 'Generate an arm log from the simulator with the same fields as the example code (ArmIO) at 50 Hz to practice importing and reading charts. The data is simulated, not from a robot.')}
      store={store}
      statorCurrentLimit={arm.statorCurrentLimit}
      fallbackGains={fallbackGains}
      scenarios={ARM_LOG_SCENARIOS}
      makeSample={(id) => {
        const sc = ARM_LOG_SCENARIOS.find((s) => s.id === id)!
        const bytes = makeArmSampleLog({ arm, ff, ...sc.build(theory, ff) })
        return { blob: new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), name: `arm-sample-${sc.id}.wpilog` }
      }}
      renderDiagnosis={(p) => <ArmDiagnosisPanel {...p} />}
    />
  )
}
