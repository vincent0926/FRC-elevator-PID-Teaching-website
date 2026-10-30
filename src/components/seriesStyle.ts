import type { ChartSeries } from './Chart'

/**
 * 圖表線條的顏色與線型，全站同一套（決策 141）。
 * 前饋、回授一定走這裡：畫面文字寫「綠色前饋、紅色回授」，而且兩條不能只靠紅綠色相區分（紅綠色弱），所以回授用虛線。
 * 目標（灰虛線）、實際（藍實線）也是固定的，寫在各頁就好。
 */
export const SERIES_STYLE = {
  feedforward: { color: '--green' },
  feedback: { color: '--red', dash: true },
} as const satisfies Record<string, Pick<ChartSeries, 'color' | 'dash'>>

export interface LineCue {
  dash?: number[]
  /** 線上每隔一段畫一個空心圓點 */
  marker?: boolean
}

/**
 * 同一張圖有兩條以上的實線時，第二條起除了顏色再加一個形狀線索（圓點、點線、點劃線），
 * 色盲或黑白列印也分得出來。虛線留給「目標、參考」（決策 141），不動；只有一條實線時完全不變。
 */
export function lineCues(series: { dash?: boolean }[]): LineCue[] {
  const solidCues: LineCue[] = [{}, { marker: true }, { dash: [2, 4] }, { dash: [10, 4, 2, 4] }, { marker: true, dash: [2, 4] }]
  const solids = series.filter((s) => !s.dash).length
  let k = 0
  return series.map((s) => {
    if (s.dash) return { dash: [6, 4] }
    const cue = solids > 1 ? solidCues[Math.min(k, solidCues.length - 1)] : {}
    k++
    return cue
  })
}
