import { useState } from 'react'

/**
 * 2F 上方的「0 匯入並檢查 → 3 上機驗證」步驟列。點一下捲到那一步的面板；
 * 那一步還沒出現（要先做完前面）就直接說明要先做什麼，不讓人點了沒反應。
 * 面板的 id 是 `${prefix}-step-N`（電梯 tune、手臂 arm-tune）。
 */

export type ReportState = 'none' | 'failed' | 'ok'

const STEPS = ['匯入並檢查', '找出問題', '處理一個問題', '上機驗證']

function whyMissing(step: number, report: ReportState): string {
  if (step === 1) {
    return report === 'failed'
      ? '步驟 0 有 ✕，這份日誌不能拿來分析。先照步驟 0 的說明處理，重錄一份再匯入。'
      : '步驟 1 要先匯入日誌（沒有日誌可以用右邊的範例日誌）並通過步驟 0 的資料檢查。'
  }
  if (step === 2) return '步驟 2 要先在步驟 1 找出最優先的問題（選對，或打開專家模式）才會出現。'
  return '步驟 3 要在步驟 2 按「套用」之後才會出現。'
}

export function StepBar({ report, prefix }: { report: ReportState; prefix: string }) {
  const [hint, setHint] = useState<string | null>(null)
  const current = report === 'ok' ? 1 : 0
  const go = (step: number) => {
    const el = document.getElementById(`${prefix}-step-${step}`)
    if (!el) {
      // 步驟 0 還沒有面板（沒匯入）就回到頁面最上面，那裡是匯入區
      if (step === 0) {
        setHint(null)
        window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      } else setHint(whyMissing(step, report))
      return
    }
    setHint(null)
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <>
      <ol className="steps" aria-label="目前步驟，點一下捲到那一步">
        {STEPS.map((label, i) => (
          <li key={label} className={i === current ? 'cur' : undefined} aria-current={i === current ? 'step' : undefined}>
            <button type="button" className="step-btn" onClick={() => go(i)}>
              {i} {label}
            </button>
          </li>
        ))}
      </ol>
      {hint && (
        <div className="note" role="status" style={{ marginTop: -8, marginBottom: 16 }}>
          {hint}
        </div>
      )}
    </>
  )
}
