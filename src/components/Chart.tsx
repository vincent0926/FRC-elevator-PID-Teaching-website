import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

/**
 * uPlot 包一層。顏色用 CSS 變數名稱，主題切換時重畫。
 * 大量時序資料（日誌 6 萬點以上）也順。
 */

export interface ChartSeries {
  label: string
  /** CSS 變數名稱，例如 '--blue' */
  color: string
  dash?: boolean
  width?: number
  values: ArrayLike<number>
  scale?: string
}

export interface ChartProps {
  title?: string
  x: ArrayLike<number>
  series: ChartSeries[]
  height?: number
  yLabel?: string
  /** 同一組 key 的圖表游標與縮放連動 */
  syncKey?: string
  /** 標示的時段（x 軸單位） */
  bands?: [number, number][]
  xLabel?: string
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}

export function Chart({ title, x, series, height = 220, yLabel, syncKey, bands, xLabel = 's' }: ChartProps) {
  const box = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    let disposed = false

    const build = () => {
      plot.current?.destroy()
      const ink3 = cssVar('--ink-3')
      const grid = cssVar('--line-2')
      const bandColor = cssVar('--yellow')
      const axis: uPlot.Axis = { stroke: ink3, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, font: '11px ' + cssVar('--font') }
      const opts: uPlot.Options = {
        width: Math.max(200, el.clientWidth),
        height,
        cursor: syncKey ? { sync: { key: syncKey, setSeries: false }, drag: { x: true, y: false } } : { drag: { x: true, y: false } },
        legend: { show: true },
        scales: { x: { time: false } },
        axes: [
          { ...axis, label: xLabel, labelSize: 14, labelFont: '11px ' + cssVar('--font') },
          { ...axis, label: yLabel, labelSize: yLabel ? 16 : 0, labelFont: '11px ' + cssVar('--font'), size: 52 },
        ],
        series: [
          { label: '時間' },
          ...series.map((s) => ({
            label: s.label,
            stroke: cssVar(s.color),
            width: s.width ?? 1.75,
            dash: s.dash ? [6, 4] : undefined,
            scale: s.scale,
            points: { show: false },
          })),
        ],
        hooks: bands?.length
          ? {
              drawClear: [
                (u: uPlot) => {
                  const ctx = u.ctx
                  ctx.save()
                  ctx.fillStyle = bandColor
                  ctx.globalAlpha = 0.2
                  for (const [a, b] of bands) {
                    const x0 = u.valToPos(a, 'x', true)
                    const x1 = u.valToPos(b, 'x', true)
                    ctx.fillRect(x0, u.bbox.top, Math.max(2, x1 - x0), u.bbox.height)
                  }
                  ctx.restore()
                },
              ],
            }
          : undefined,
      }
      const data = [x, ...series.map((s) => s.values)] as unknown as uPlot.AlignedData
      plot.current = new uPlot(opts, data, el)
    }

    build()
    const ro = new ResizeObserver(() => {
      if (!disposed && plot.current) plot.current.setSize({ width: Math.max(200, el.clientWidth), height })
    })
    ro.observe(el)
    const onTheme = () => build()
    window.addEventListener('themechange', onTheme)
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onTheme)
    return () => {
      disposed = true
      ro.disconnect()
      window.removeEventListener('themechange', onTheme)
      mq.removeEventListener('change', onTheme)
      plot.current?.destroy()
      plot.current = null
    }
  }, [x, series, height, yLabel, syncKey, bands, xLabel])

  return (
    <figure className="chart-box" style={{ margin: 0 }}>
      {title && <figcaption className="chart-title">{title}</figcaption>}
      <div ref={box} />
    </figure>
  )
}
