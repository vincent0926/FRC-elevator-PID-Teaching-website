import { useState } from 'react'
import { TUNING_STEPS } from './tuningSteps'

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
        <b>新手：照順序調</b>
        <span className="small muted">kG → kV、kA → kP → kD，一步一步加，看每個參數在做什麼。會換掉目前的「自訂」參數。</span>
      </summary>
      <div className="row" style={{ marginTop: 12 }}>
        <span className="small muted">快速載入：</span>
        <button className="btn small" type="button" onClick={onReset}>
          重置為理論值
        </button>
        <button className="btn small" type="button" onClick={onWellTuned}>
          調好的範例
        </button>
        <button className="btn small" type="button" onClick={() => onScenario('kPTooBig')}>
          超調示範
        </button>
        <button className="btn small" type="button" onClick={() => onScenario('antiWindup')}>
          積分飽和示範
        </button>
      </div>
      <ol className="guide-steps">
        {TUNING_STEPS.map((s, i) => (
          <li key={s.title} className={step === i ? 'on' : undefined}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{s.title}</b>
              <button className="btn small" type="button" aria-pressed={step === i} onClick={() => go(i)}>
                {step === i ? '已套用' : '套用這一步'}
              </button>
            </div>
            <p className="small" style={{ margin: '4px 0' }}>
              {s.what}
            </p>
            {step === i && <p className="small muted" style={{ margin: 0 }}>看圖：{s.look}</p>}
          </li>
        ))}
      </ol>
      <p className="small muted" style={{ margin: 0 }}>
        建議先用「理想模型」看清楚每一步，再切「真實模型」看摩擦、飽和、延遲會讓哪一步變難。真的機器人也照這個順序：kG、kS 先量準，再 kV、kA，最後才碰 kP、kD。
      </p>
    </details>
  )
}
