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

/**
 * 3F 模擬器的範圍：哪些有模擬、哪些是近似、哪些完全沒有。
 * 這是自己寫的教學模型，不是 TalonFX／SPARK MAX 韌體的數值重現。
 */
export const SIM_SCOPE: { title: string; items: string[] }[] = [
  {
    title: '有模擬',
    items: [
      '直流馬達：反電動勢、繞組電阻、扭矩常數（每顆馬達、齒比、鼓輪半徑都照 1F）',
      '串級式等效質量（重力用 Σmᵢkᵢ、慣性用 Σmᵢkᵢ²）、配重',
      'Motion Magic 梯形軌跡、Slot0 控制公式（前饋用參考速度、加速度）',
      '真實模型可開：電壓飽和、Stator／Supply 電流限制、軟體限位、輸出上限、Brake／Coast',
    ],
  },
  {
    title: '近似',
    items: [
      '電池：固定電壓加固定內阻 0.02 Ω（模擬假設，不是量來的）',
      '摩擦：只有固定大小的庫侖摩擦（kS），往上往下可以不一樣',
      '電流限制：一超過就剛好壓在上限，沒有控制器內部迴路的過衝和延遲',
      'Supply 電流：用 Stator 電流 × 佔空比估計',
      '齒輪箱效率：固定係數；串級中間各級的摩擦、效率損失沒有分開算',
      '感測延遲、雜訊：你設定的數字',
    ],
  },
  {
    title: '沒有模擬',
    items: [
      '馬達發熱（R 變大、出力變小）、電池電量隨時間下降',
      '皮帶、鏈條伸長、背隙、各級晃動；鼓輪纏繞多層時有效半徑變大',
      '黏滯摩擦、隨高度變化的摩擦（除了連續式換級 kG 跳變）',
      'CAN 延遲細節、編碼器量化、控制器韌體的實際演算法（例如 FOC 換相、內部濾波）',
    ],
  },
]
