import { useCallback } from 'react'
import { useStore } from '../../app/store'
import { useElevator } from '../../app/elevatorStore'
import { applyChange, gainsOf, paramsFromGains } from '../../core/analysis/apply'
import type { Slot0Gains } from '../../core/controller/slot0'
import type { ParameterSet } from '../../schema/parameterSet'
import { LESSONS } from '../calculate/lessons'
import { DiagnosisView, type DiagnosisConfig } from './DiagnosisView'
import type { DiagnosisProps } from './TuningWorkspace'
import { t } from '../../core/lang'

/** 電梯 2F 步驟 1–3：共用的 DiagnosisView，套用建議存成「調參建議值」，3F 選它預覽。 */

const GAIN_ROWS: [keyof Slot0Gains, string, number][] = [
  ['kS', 'V', 3],
  ['kG', 'V', 3],
  ['kV', 'V/(m/s)', 3],
  ['kA', 'V/(m/s²)', 4],
  ['kP', 'V/m', 1],
  ['kD', 'V/(m/s)', 2],
]

export function DiagnosisPanel(props: DiagnosisProps<ParameterSet>) {
  const { lessonsDone, go } = useStore()
  const store = useElevator()
  const { mechanism, theory, custom, tuning, setTuning, setSimSource } = store
  const fromGains = useCallback((g: Slot0Gains, mm: ParameterSet['motionMagic'], note: string) => paramsFromGains(mechanism, g, mm, 'measured', note), [mechanism])
  const withMechanism = useCallback((p: ParameterSet) => ({ ...p, mechanism }), [mechanism])
  const config: DiagnosisConfig<ParameterSet> = {
    kind: 'elevator',
    idPrefix: 'tune',
    sets: [
      { key: 'tuning', label: t('上次的調參建議值', 'Last tuning suggestion'), short: t('調參建議值', 'tuning suggestion'), params: tuning },
      { key: 'custom', label: t('自訂參數組', 'Custom gain set'), short: t('自訂', 'custom'), params: custom },
      { key: 'theory', label: t('理論值', 'Theory'), short: t('理論值', 'theory'), params: theory },
    ],
    gainsOf,
    fromGains,
    withMechanism,
    gainRows: GAIN_ROWS,
    motionMagicText: (mm) => `${mm.cruiseVelocity.toFixed(2)} / ${mm.acceleration.toFixed(1)}`,
    motionMagicUnit: t('m/s、m/s²', 'm/s, m/s²'),
    statorCurrentLimit: mechanism.statorCurrentLimit,
    expertUnlocked: LESSONS.every((l) => lessonsDone[l.id]),
    store,
    onApply: (base, change, note) => setTuning(applyChange(base, change, note)),
    onPreview: () => {
      setSimSource('tuning')
      go('sim')
    },
    text: {
      intro: t('建議是「在這組參數上改一個」，所以要先知道錄日誌時機器人跑的是哪一組。', 'The advice is “change one thing from this set of gains”, so first you need to know which set the robot was running when the log was recorded.'),
      expertLock: t('教學關卡全部完成才開放', 'Unlocks after finishing all the lessons'),
      expertLockNote: t('（完成教學關卡後開放）', ' (unlocks after the lessons)'),
      order: t(
        <>
        先自己看圖。照順序檢查：<b>物理限制 → 振盪 → 機構問題 → kG → kS → kV → kA → kP → kD</b>。前面的問題沒解決，後面的判斷都不準。
        </>,
        <>
          Look at the charts yourself first. Check in this order: <b>physical limits → oscillation → mechanism problems → kG → kS → kV → kA → kP → kD</b>. Until the earlier problems are fixed, later judgments aren’t reliable.
        </>,
      ),
      placeholder: t('例如：靜止時紅線一直在 0 上面', 'e.g. at rest the red line stays above 0'),
      hintNone: t('回授輸出（紅線）是不是一直在 0 附近？位置有沒有緊跟目標？', 'Is the feedback output (red line) staying near 0? Is the position tracking the target closely?'),
      hintLookNone: t('看電壓圖的紅線和位置圖：都很乾淨的話，就是沒有問題。', 'Look at the red line on the voltage chart and the position chart: if both are clean, there’s no problem.'),
      applyLabel: t('套用成調參建議值', 'Apply as tuning suggestion'),
      applied: t('已存成「調參建議值」。先到模擬看看改完的樣子，再上機。', 'Saved as “Tuning suggestion”. Preview the change in the sim before going to the robot.'),
      noChange: t('這不是改參數能解決的，照上面的檢查清單處理機構，再重錄一份日誌。', 'This can’t be fixed by changing gains. Work through the checklist above on the mechanism, then record a new log.'),
      verify: t(
        <>
        <li>把上面建議改的那一個參數，改進機器人專案的程式碼（程式碼才是參數的最終依據）。</li>
        <li>照單元零的流程上機：先低速、有人顧 Disable。</li>
        <li>用同樣的動作再錄一份日誌，回到這裡匯入，看問題有沒有消失。</li>
        </>,
        <>
          <li>Put the one gain changed above into the robot project’s code (the code is the final source of truth for gains).</li>
          <li>Test on the robot following unit 0: start slow, with someone ready to disable.</li>
          <li>Record another log doing the same motion, import it here, and see whether the problem is gone.</li>
        </>,
      ),
      passed: t('把這組參數寫進程式碼並 commit。之後換機構或加重量，再重新走一次循環。', 'Put this set of gains into the code and commit. If you change the mechanism or add weight later, go around the loop again.'),
    },
  }
  return <DiagnosisView {...props} config={config} />
}
