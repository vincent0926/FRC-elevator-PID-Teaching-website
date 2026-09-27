import { useEffect, useRef, useState } from 'react'
import type { SimResult } from '../../core/physics/simulate'

/**
 * 動畫區：小井道照模擬結果播放電梯位置，虛線框是軌跡目前的目標。
 * 播放列可以暫停、慢動作、拖時間軸（Phase 3 步驟 7）。
 */

export const SPEEDS = [1, 0.25, 0.1] as const

export interface Playback {
  /** 目前顯示第幾筆；null = 還沒播放，顯示最後一格 */
  idx: number | null
  playing: boolean
  speed: number
  play: () => void
  pause: () => void
  seek: (i: number) => void
  setSpeed: (s: number) => void
}

export function usePlayback(result: SimResult | null): Playback {
  // 播放位置只對應某一次的結果；結果換了就回到「顯示最後一格」
  const [state, setState] = useState<{ of: SimResult | null; idx: number | null; playing: boolean }>({ of: null, idx: null, playing: false })
  const [speed, setSpeedState] = useState<number>(1)
  const raf = useRef(0)
  const current = state.of === result
  const idx = current ? state.idx : null
  const playing = current && state.playing

  useEffect(() => () => cancelAnimationFrame(raf.current), [result])

  const run = (from: number, s: number) => {
    if (!result) return
    cancelAnimationFrame(raf.current)
    const last = result.t.length - 1
    const dt = result.t[1] - result.t[0] || 0.001
    const start = performance.now()
    const frame = (now: number) => {
      const k = Math.min(last, from + Math.floor(((now - start) / 1000 / dt) * s))
      const more = k < last
      setState({ of: result, idx: k, playing: more })
      if (more) raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
  }

  return {
    idx,
    playing,
    speed,
    play: () => {
      if (!result) return
      const last = result.t.length - 1
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setState({ of: result, idx: last, playing: false })
        return
      }
      run(idx === null || idx >= last ? 0 : idx, speed)
    },
    pause: () => {
      cancelAnimationFrame(raf.current)
      setState({ of: result, idx, playing: false })
    },
    seek: (i) => {
      cancelAnimationFrame(raf.current)
      setState({ of: result, idx: i, playing: false })
    },
    setSpeed: (s) => {
      setSpeedState(s)
      if (playing && idx !== null) run(idx, s)
    },
  }
}

export function MiniShaft({ result, travel, goal, idx }: { result: SimResult | null; travel: number; goal: number; idx: number | null }) {
  const box = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(300)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const k = idx ?? (result ? result.t.length - 1 : 0)
  const cab = 26
  const usable = Math.max(40, h - 16 - cab)
  const top = (x: number) => 8 + usable * (1 - Math.min(1, Math.max(0, x / travel)))
  const pos = result ? result.pos[k] : 0
  const refGoal = result && idx !== null ? result.refPos[k] : goal

  return (
    <div className="mini-shaft" ref={box} aria-hidden="true">
      <div className="tgt" style={{ top: top(refGoal) }} />
      <div className="cab" style={{ top: top(pos) }} />
      <div className="scale">
        <span>{travel.toFixed(2)}</span>
        <span>{(travel / 2).toFixed(2)}</span>
        <span>0</span>
      </div>
    </div>
  )
}

export function PlaybackBar({ result, pb, unit = 'm' }: { result: SimResult | null; pb: Playback; unit?: 'm' | 'rad' }) {
  const last = result ? result.t.length - 1 : 0
  const k = pb.idx ?? last
  const t = result ? result.t[k] : 0
  return (
    <div className="playbar">
      <button className="btn small" type="button" disabled={!result} onClick={pb.playing ? pb.pause : pb.play}>
        {pb.playing ? '暫停' : '播放'}
      </button>
      <div className="seg" role="group" aria-label="播放速度">
        {SPEEDS.map((s) => (
          <button key={s} type="button" aria-pressed={pb.speed === s} onClick={() => pb.setSpeed(s)}>
            {s === 1 ? '正常' : `${s}×`}
          </button>
        ))}
      </div>
      <input
        type="range"
        aria-label="時間軸"
        min={0}
        max={last}
        step={10}
        value={k}
        disabled={!result}
        onChange={(e) => pb.seek(Number(e.target.value))}
      />
      <span className="small muted num-w">
        {t.toFixed(2)} s・{result ? (unit === 'rad' ? `${((result.pos[k] * 180) / Math.PI).toFixed(1)}°` : `${(result.pos[k] * 100).toFixed(1)} cm`) : ''}
      </span>
    </div>
  )
}
