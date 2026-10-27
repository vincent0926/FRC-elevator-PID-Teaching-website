import { useMemo } from 'react'
import { useElevator } from '../../app/elevatorStore'
import { gainsOf } from '../../core/analysis/apply'
import { makeSampleLog } from '../../core/log/sampleLog'
import { DiagnosisPanel } from './DiagnosisPanel'
import { SCENARIOS } from './sampleScenarios'
import { TuningWorkspace } from './TuningWorkspace'
import { GUIDE_ANCHOR } from '../guide/guideContent'
import { t } from '../../core/lang'

/**
 * 電梯 2F 調參建議：共用的 TuningWorkspace（步驟 0）+ DiagnosisPanel（步驟 1–3）。
 * 步驟 0 通過的實機日誌記成 lastLog，3F 模型校正用。
 */
export function TuningPage() {
  const store = useElevator()
  const { mechanism, ff, theory, custom, tuning, setLastLog } = store
  const fallbackGains = useMemo(() => gainsOf(tuning ?? custom ?? theory), [tuning, custom, theory])

  return (
    <TuningWorkspace
      kind="elevator"
      idPrefix="tune"
      helpSection={GUIDE_ANCHOR.tune}
      title={t('調參建議', 'Tuning advice')}
      lead={t('匯入實機日誌，先檢查資料能不能用，再看問題出在哪。一次只處理一個問題，改完再測。', 'Import a log from the robot, check the data is usable, then see where the problem is. Fix one problem at a time and test again after each change.')}
      dropLabel={t('把 .wpilog 拖到這裡', 'Drop a .wpilog here')}
      dropNote={t('檔案只在這台電腦的瀏覽器裡解析，不會上傳。第一次匯入要設定欄位對應，之後自動套用。', 'The file is parsed only in this browser and never uploaded. The first import needs a field mapping; after that it’s applied automatically.')}
      simNote={t(
        <>
        這份是 <b>3F 模擬</b>出來的資料，不是實機日誌。拿來練習讀圖、看調參建議，數字以上機實測為準。診斷會直接用模擬時的參數當「機器人上當時的參數」。
        按「套用」後回 3F 選「調參建議值」，同樣的目標再跑一次，看問題有沒有消失。
        </>,
        <>
          This came from the <b>3F sim</b>, not a robot log. Use it to practice reading charts and the tuning advice; real numbers come from testing on the robot. The diagnosis uses the sim’s gains as “the gains on the robot at the time”.{' '}
          After pressing “Apply”, go back to 3F, pick “Tuning suggestion” and run the same target again to see whether the problem is gone.
        </>,
      )}
      sampleNote={t('用模擬器產生一份跟範例機器人程式欄位相同的日誌（50 Hz），拿來練習匯入和讀圖。', 'Generate a log from the simulator with the same fields as the example robot code (50 Hz) to practice importing and reading charts.')}
      store={store}
      statorCurrentLimit={mechanism.statorCurrentLimit}
      mappingMechanism={mechanism}
      fallbackGains={fallbackGains}
      scenarios={SCENARIOS}
      makeSample={(id) => {
        const sc = SCENARIOS.find((s) => s.id === id)!
        const bytes = makeSampleLog({ mechanism, ff, ...sc.build(theory, ff) })
        return { blob: new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), name: `sample-${sc.id}.wpilog` }
      }}
      // 步驟 0 沒過的日誌不能拿去 3F 校正
      onFileChecked={(log, report, name) => setLastLog(report.ok ? { log, name } : null)}
      renderDiagnosis={(p) => <DiagnosisPanel {...p} />}
    />
  )
}
