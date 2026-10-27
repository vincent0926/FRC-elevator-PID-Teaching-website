import { useCallback } from 'react'
import { useStore } from '../../app/store'
import type { Slot0Gains } from '../../core/controller/slot0'
import type { ArmParameterSet } from '../../schema/armParameterSet'
import { DiagnosisView, type DiagnosisConfig } from '../tuning/DiagnosisView'
import type { DiagnosisProps } from '../tuning/TuningWorkspace'
import { ARM_LESSONS } from './armLessons'
import { useArm } from './armStore'
import { applyArmChange, armGains, armParamsFromGains } from './armTuning'
import { t } from '../../core/lang'

/**
 * 手臂 2F 步驟 1–3：跟電梯同一個 DiagnosisView，重力項換成 kG·cos θ、位置是角度。
 * 套用建議會存成手臂的「自訂」，到 3F 選自訂就能預覽。
 */

const GAIN_ROWS: [keyof Slot0Gains, string, number][] = [
  ['kS', 'V', 3],
  ['kG', t('V（水平時）', 'V (horizontal)'), 3],
  ['kV', 'V/(rad/s)', 3],
  ['kA', 'V/(rad/s²)', 4],
  ['kP', 'V/rad', 1],
  ['kD', 'V/(rad/s)', 2],
]
const R2D = 180 / Math.PI

export function ArmDiagnosisPanel(props: DiagnosisProps<ArmParameterSet>) {
  const { lessonsDone, go } = useStore()
  const store = useArm()
  const { arm, theory, custom, setCustom, setSource: setSimSource } = store
  const fromGains = useCallback((g: Slot0Gains, mm: ArmParameterSet['motionMagic'], note: string) => armParamsFromGains(arm, g, mm, 'measured', note), [arm])
  const withMechanism = useCallback((p: ArmParameterSet) => ({ ...p, mechanism: arm }), [arm])
  const config: DiagnosisConfig<ArmParameterSet> = {
    kind: 'arm',
    idPrefix: 'arm-tune',
    sets: [
      { key: 'custom', label: t('自訂參數組', 'Custom gain set'), short: t('自訂', 'custom'), params: custom },
      { key: 'theory', label: t('理論值', 'Theory'), short: t('理論值', 'theory'), params: theory },
    ],
    gainsOf: armGains,
    fromGains,
    withMechanism,
    gainRows: GAIN_ROWS,
    motionMagicText: (mm) => `${(mm.cruiseVelocity * R2D).toFixed(0)} / ${(mm.acceleration * R2D).toFixed(0)}`,
    motionMagicUnit: t('°/s、°/s²', '°/s, °/s²'),
    statorCurrentLimit: arm.statorCurrentLimit,
    expertUnlocked: ARM_LESSONS.every((l) => lessonsDone[l.id]),
    store,
    onApply: (base, change, note) => {
      setCustom(applyArmChange(base, change, note))
      setSimSource('custom')
    },
    onPreview: () => go('sim'),
    text: {
      intro: t('建議是「在這組參數上改一個」，所以要先知道錄日誌時手臂跑的是哪一組。', 'The advice is “change one thing from this set of gains”, so first you need to know which set the arm was running when the log was recorded.'),
      expertLock: t('手臂的教學關卡全部完成才開放', 'Unlocks after finishing all the arm lessons'),
      expertLockNote: t('（完成手臂的教學關卡後開放）', ' (unlocks after the arm lessons)'),
      order: t(
        <>
        先自己看圖。照順序檢查：<b>物理限制 → 振盪 → 機構問題 → kG → kS → kV → kA → kP → kD</b>。手臂的 kG 看「停在水平附近」的時候最清楚。
        </>,
        <>
          Look at the charts yourself first. Check in this order: <b>physical limits → oscillation → mechanism problems → kG → kS → kV → kA → kP → kD</b>. An arm’s kG is clearest when it’s “stopped near horizontal”.
        </>,
      ),
      placeholder: t('例如：停在水平時紅線一直在 0 上面', 'e.g. stopped at horizontal, the red line stays above 0'),
      hintNone: t('回授輸出（紅線）是不是一直在 0 附近？角度有沒有緊跟目標？', 'Is the feedback output (red line) staying near 0? Is the angle tracking the target closely?'),
      hintLookNone: t('看電壓圖的紅線和角度圖：都很乾淨的話，就是沒有問題。', 'Look at the red line on the voltage chart and the angle chart: if both are clean, there’s no problem.'),
      applyLabel: t('套用並存成「自訂」', 'Apply and save as “Custom”'),
      applied: t('已存成手臂的「自訂」參數。先到 3F 看看改完的樣子，再上機。', 'Saved as the arm’s “Custom” gains. Preview the change in 3F before going to the robot.'),
      noChange: t('這不是改一個數字能解決的，照上面的檢查清單處理，再重錄一份日誌。', 'This can’t be fixed by changing one number. Work through the checklist above, then record a new log.'),
      verify: t(
        <>
        <li>把上面建議改的那一個參數，改進機器人專案的程式碼（程式碼才是參數的最終依據）。</li>
        <li>照單元零的流程上機：先低速、有人顧 Disable，人不要站在手臂掃過的範圍。</li>
        <li>用同樣的動作（Arm.tuningRoutine）再錄一份日誌，回到這裡匯入，看問題有沒有消失。</li>
        </>,
        <>
          <li>Put the one gain changed above into the robot project’s code (the code is the final source of truth for gains).</li>
          <li>Test on the robot following unit 0: start slow, with someone ready to disable, and nobody standing where the arm swings.</li>
          <li>Record another log doing the same motion (Arm.tuningRoutine), import it here, and see whether the problem is gone.</li>
        </>,
      ),
      passed: t('把這組參數寫進程式碼並 commit。之後換負載或改手臂，再重新走一次循環。', 'Put this set of gains into the code and commit. If you change the load or the arm later, go around the loop again.'),
    },
  }
  return <DiagnosisView {...props} config={config} />
}
