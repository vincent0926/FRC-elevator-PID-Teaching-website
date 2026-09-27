import type { ReactNode } from 'react'

/**
 * 「這是近似模型」標示：模擬、理論值、校正結果都是簡化過的模型，
 * 要讓隊員知道哪裡簡化了、能相信到什麼程度。
 */

export function ApproxNote({ summary, items, children }: { summary: ReactNode; items: string[]; children?: ReactNode }) {
  return (
    <div className="approx" role="note">
      <b>這是近似模型。</b>
      <span>{summary}</span>
      <details>
        <summary className="small">簡化了哪些地方（{items.length} 項）</summary>
        <ul className="small">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {children}
      </details>
    </div>
  )
}

/** 受控體與馬達模型共用的簡化清單 */
export const PLANT_ASSUMPTIONS = [
  '控制輸入 u 以電壓 [V] 表示：這不是說「電壓是力」，而是把馬達的控制輸入統一寫成電壓，讓電氣模型（V = I·R + ω/Kv）和機械模型（F = m·a）可以直接接起來。',
  '直流馬達是線性模型：電阻 R、扭矩常數 kT、轉速常數 Kv 都當常數。真的馬達熱了 R 會變大、出力變小。',
  '摩擦只有固定大小的庫侖摩擦（kS），沒有隨速度變大的黏滯摩擦，也不隨高度變（除非打開換級 kG 跳變）。',
  '機構是剛體：皮帶、鏈條不會伸長，沒有背隙，各級之間沒有晃動。',
  '齒輪箱效率是固定係數，往上往下一樣。',
  '真實模型開啟電池壓降時，電池是固定電壓加固定內阻 0.02 Ω；理想模型不算電池壓降。真的電池會隨電量、溫度、老化改變。',
  '電流限制是理想的：一超過就剛好壓在上限。真的控制器有自己的控制迴路，會有一點過衝和延遲。',
  '電池端（Supply）電流用「Stator 電流 × 佔空比」估計，沒有算控制器本身的損耗。',
  '感測延遲、雜訊是你設定的數字，不是量來的；沒有編碼器量化、CAN 延遲的細節。',
]
