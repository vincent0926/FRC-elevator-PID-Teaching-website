import { useEffect, useRef, useState } from 'react'
import type { SimResult } from '../../core/physics/simulate'

/** 小井道：照模擬結果的時間播放電梯位置。虛線框是目前目標。 */

export function MiniShaft({ result, travel, goal }: { result: SimResult | null; travel: number; goal: number }) {
  // 播放位置只對應某一次的結果；結果換了就自動回到「顯示最後一格」
  const [anim, setAnim] = useState<{ of: SimResult | null; i: number | null; playing: boolean }>({ of: null, i: null, playing: false })
  const current = anim.of === result
  const i = current ? anim.i : null
  const playing = current && anim.playing
  const setI = (k: number | null, p = false) => setAnim({ of: result, i: k, playing: p })
  const raf = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(300)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => () => cancelAnimationFrame(raf.current), [result])
  const play = () => {
    if (!result) return
    cancelAnimationFrame(raf.current)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setI(result.t.length - 1)
      return
    }
    const start = performance.now()
    const dt = result.t[1] - result.t[0] || 0.001
    const frame = (now: number) => {
      const k = Math.min(result.t.length - 1, Math.floor((now - start) / 1000 / dt))
      const more = k < result.t.length - 1
      setI(k, more)
      if (more) raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
  }

  const idx = i ?? (result ? result.t.length - 1 : 0)
  const cab = 26
  const usable = Math.max(40, h - 60 - cab)
  const top = (x: number) => 8 + usable * (1 - Math.min(1, Math.max(0, x / travel)))
  const pos = result ? result.pos[idx] : 0
  const refGoal = result && i !== null ? result.refPos[idx] : goal

  return (
    <div className="mini-shaft" ref={box} aria-hidden="true">
      <div className="tgt" style={{ top: top(refGoal) }} />
      <div className="cab" style={{ top: top(pos) }} />
      <div className="scale" style={{ bottom: 50 }}>
        <span>{travel.toFixed(2)}</span>
        <span>{(travel / 2).toFixed(2)}</span>
        <span>0</span>
      </div>
      <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, textAlign: 'center' }}>
        <button className="btn small" type="button" onClick={play} disabled={!result || playing} tabIndex={-1}>
          {playing && result ? `${result.t[idx].toFixed(1)} s` : '播放'}
        </button>
      </div>
    </div>
  )
}
