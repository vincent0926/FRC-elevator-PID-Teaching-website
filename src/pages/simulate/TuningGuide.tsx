import { useState } from 'react'
import { TUNING_STEPS } from './tuningSteps'
import { t } from '../../core/lang'

/**
 * 3F 新手引導：照順序調（kG → kV、kA → kP → kD），加上四個快速載入按鈕。
 * 每一步都換掉「自訂」參數，所以跟教學情境一樣會提醒。
 */
export function TuningGuide({
  onStep,
  onReset,
  onWellTuned,
  onScenario,
}: {
  onStep: (i: number) => void
  onReset: () => void
  onWellTuned: () => void
  onScenario: (id: string) => void
}) {
  const [step, setStep] = useState<number | null>(null)
  const go = (i: number) => {
    setStep(i)
    onStep(i)
  }
  return (
    <details className="panel scen" style={{ marginBottom: 16 }}>
      <summary>
        <b>{t('新手：照順序調', 'Beginner: tune in order')}</b>
        <span className="small muted">{t('kG → kV、kA → kP → kD，一步一步加，看每個參數在做什麼。會換掉目前的「自訂」參數。', 'kG → kV, kA → kP → kD, adding one step at a time to see what each gain does. This replaces your current “Custom” gains.')}</span>
      </summary>
      <div className="row" style={{ marginTop: 12 }}>
        <span className="small muted">{t('快速載入：', 'Quick load:')}</span>
        <button className="btn small" type="button" onClick={onReset}>
          {t('重置為理論值', 'Reset to theory')}
        </button>
        <button className="btn small" type="button" onClick={onWellTuned}>
          {t('調好的範例', 'Tuned example')}
        </button>
        <button className="btn small" type="button" onClick={() => onScenario('kPTooBig')}>
          {t('超調示範', 'Overshoot demo')}
        </button>
        <button className="btn small" type="button" onClick={() => onScenario('antiWindup')}>
          {t('積分飽和示範', 'Windup demo')}
        </button>
      </div>
      <ol className="guide-steps">
        {TUNING_STEPS.map((s, i) => (
          <li key={s.title} className={step === i ? 'on' : undefined}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{s.title}</b>
              <button className="btn small" type="button" aria-pressed={step === i} onClick={() => go(i)}>
                {step === i ? t('已套用', 'Applied') : t('套用這一步', 'Apply this step')}
              </button>
            </div>
            <p className="small" style={{ margin: '4px 0' }}>
              {s.what}
            </p>
            {step === i && <p className="small muted" style={{ margin: 0 }}>{t('看圖：', 'In the charts: ')}{s.look}</p>}
          </li>
        ))}
      </ol>
      <p className="small muted" style={{ margin: 0 }}>
        {t(
          <>
          建議先用「理想模型」看清楚每一步，再切「真實模型」看摩擦、飽和、延遲會讓哪一步變難。真的機器人也照這個順序：kG、kS 先量準，再 kV、kA，最後才碰 kP、kD。
          </>,
          <>
            Start with the “Ideal model” to see each step clearly, then switch to the “Realistic model” to see which steps friction, saturation and delay make harder. Do it in the same order on the real robot: measure kG and kS first, then kV and kA, and only then touch kP and kD.
          </>,
        )}
      </p>
    </details>
  )
}
