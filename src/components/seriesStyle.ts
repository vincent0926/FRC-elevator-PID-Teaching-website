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
