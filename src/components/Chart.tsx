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
  /** 圖例裡 x 的名稱（預設「時間」） */
  xName?: string
  /** 圖的說明：看什麼、怎麼判斷（標題下面的小字） */
  note?: string
  /** 播放中的時間（x 軸單位）：畫一條直線，圖例顯示這個時間的數值；null = 不畫 */
  cursorX?: number | null
}

/** uPlot 只認 null 為斷點，NaN 會弄壞 y 軸範圍 */
function withGaps(v: ArrayLike<number>): ArrayLike<number | null> {
  for (let i = 0; i < v.length; i++) {
    if (!Number.isFinite(v[i])) return Array.from(v, (y) => (Number.isFinite(y) ? y : null))
  }
  return v
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}

export function Chart({ title, x, series, height = 220, yLabel, syncKey, bands, xLabel = 's', xName = '時間', note, cursorX = null }: ChartProps) {
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
      // 每個軸各自一份：uPlot 會改寫傳進去的 grid、ticks 物件，共用會讓 y 軸不畫刻度
      const axis = (): uPlot.Axis => ({ stroke: ink3, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, font: '11px ' + cssVar('--font') })
      const opts: uPlot.Options = {
        width: Math.max(200, el.clientWidth),
        height,
        // 只畫垂直的時間線；水平線在播放時會停在圖中間，看起來像一條資料
        cursor: syncKey ? { y: false, sync: { key: syncKey, setSeries: false }, drag: { x: true, y: false } } : { y: false, drag: { x: true, y: false } },
        legend: { show: true },
        scales: { x: { time: false } },
        axes: [
          { ...axis(), label: xLabel, labelSize: 14, labelFont: '11px ' + cssVar('--font') },
          { ...axis(), label: yLabel, labelSize: yLabel ? 16 : 0, labelFont: '11px ' + cssVar('--font'), size: 52 },
        ],
        series: [
          { label: xName },
          ...series.map((s) => ({
            label: s.label,
            stroke: cssVar(s.color),
            width: s.width ?? 1.75,
            dash: s.dash ? [6, 4] : undefined,
            // 明確傳 undefined 會蓋掉 uPlot 預設的 'y'，y 軸就畫不出刻度
            ...(s.scale ? { scale: s.scale } : {}),
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
      const data = [x, ...series.map((s) => withGaps(s.values))] as unknown as uPlot.AlignedData
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
  }, [x, series, height, yLabel, syncKey, bands, xLabel, xName])

  // 播放時把游標放到目前時間：圖上有一條直線，圖例顯示這一刻每條線的數值
  useEffect(() => {
    const u = plot.current
    if (!u) return
    if (cursorX === null || !Number.isFinite(cursorX)) {
      u.setCursor({ left: -10, top: -10 })
      return
    }
    u.setCursor({ left: u.valToPos(cursorX, 'x'), top: u.bbox.height / (2 * devicePixelRatio) })
  }, [cursorX, x, series])

  return (
    <figure className="chart-box" style={{ margin: 0 }}>
      {title && <figcaption className="chart-title">{title}</figcaption>}
      {note && <p className="chart-note small muted">{note}</p>}
      <div ref={box} />
    </figure>
  )
}
