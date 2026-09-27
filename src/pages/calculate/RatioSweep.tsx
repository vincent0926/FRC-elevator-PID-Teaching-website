import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { Chart, type ChartSeries } from '../../components/Chart'
import { ratioPoint, sweepRatios } from '../../core/ratioSweep'
import { shareUrl } from '../../core/shareLink'

/**
 * 1F「齒比怎麼選」：其他機構資料不變只換齒比，畫跑完全程的時間和停在半空的電流。
 * 參考 ReCalc 的線性機構計算機；數字用這個網站自己的前饋模型，跟參數卡一致。
 */

const f = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '—')

export function RatioSweep() {
  const { mechanism, setMechanism } = useStore()
  const G = mechanism.gearRatio
  const { points, fastest, here } = useMemo(() => {
    const min = Math.max(1, Math.min(3, G * 0.5))
    const max = Math.max(25, G * 2.5)
    return { ...sweepRatios(mechanism, min, max), here: ratioPoint(mechanism, G) }
  }, [mechanism, G])

  const x = useMemo(() => Float64Array.from(points, (p) => p.ratio), [points])
  const time: ChartSeries[] = useMemo(
    () => [{ label: '跑完全程的時間', color: '--blue', values: Float64Array.from(points, (p) => (Number.isFinite(p.travelTime) ? p.travelTime : NaN)) }],
    [points],
  )
  const cur: ChartSeries[] = useMemo(
    () => [
      { label: '停在半空每顆馬達的電流', color: '--amber', values: Float64Array.from(points, (p) => p.holdCurrent) },
      { label: 'Stator 電流限制', color: '--red', dash: true, values: Float64Array.from(points, () => mechanism.statorCurrentLimit) },
    ],
    [points, mechanism.statorCurrentLimit],
  )
  const band = useMemo<[number, number][]>(() => [[G - 0.08, G + 0.08]], [G])
  const slower = fastest && here.travelTime - fastest.travelTime > 0.05

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        其他機構資料不變，只換齒比。時間用 Motion Magic 建議值（速度、加速度上限的 75%）算從最低跑到最高；黃色直線是你現在的齒比 {G}:1。
      </p>
      <Chart title="跑完全程的時間" x={x} series={time} height={170} yLabel="s" xLabel=":1" xName="齒比" bands={band} />
      <Chart title="停在半空的電流（每顆馬達）" x={x} series={cur} height={150} yLabel="A" xLabel=":1" xName="齒比" bands={band} />
      <table className="tbl">
        <tbody>
          <tr>
            <td>現在 {G}:1</td>
            <td className="num">{f(here.travelTime, 2)} s</td>
            <td className="num">{f(here.holdCurrent, 1)} A</td>
            <td className="num">最高 {f(here.cruiseVelocity, 2)} m/s</td>
          </tr>
          {fastest && (
            <tr>
              <td>最快 {f(fastest.ratio, 1)}:1</td>
              <td className="num">{f(fastest.travelTime, 2)} s</td>
              <td className="num">{f(fastest.holdCurrent, 1)} A</td>
              <td className="num">最高 {f(fastest.cruiseVelocity, 2)} m/s</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="small">
        <b>怎麼看：</b>齒比小，最高速度高，但扛重力要吃比較多電流、起步加速度被電流限制卡住；齒比大，省電流、kG 小，但最高速度低，行程長時反而慢。
        最快的齒比不一定最好：留一點餘裕給比賽後段電池變低、機構變重，通常選比最快<b>稍大一點</b>的齒比。停在半空的電流太大（例如超過 20 A）馬達會一直發熱。
      </div>
      {slower && fastest && (
        <div className="row">
          <button className="btn small" type="button" onClick={() => setMechanism({ ...mechanism, gearRatio: Math.round(fastest.ratio * 10) / 10 })}>
            試試 {f(fastest.ratio, 1)}:1（參數卡會跟著變）
          </button>
          <span className="small muted">齒比是機構決定的，換之前確認有這種齒輪箱組合。</span>
        </div>
      )}
    </div>
  )
}

/** 把機構資料放進網址，傳給隊友打開就是同一台電梯 */
export function ShareMechanism() {
  const { mechanism } = useStore()
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const make = () => {
    const u = shareUrl(location.href, mechanism)
    setUrl(u)
    setCopied(false)
    navigator.clipboard
      ?.writeText(u)
      .then(() => setCopied(true))
      .catch(() => {})
  }
  return (
    <div className="stack">
      <div className="row">
        <button className="btn" type="button" onClick={make}>
          產生分享連結
        </button>
        <span className="small muted">只放機構資料（質量、齒比、馬達……），不放調過的參數。</span>
      </div>
      {url && (
        <>
          <span className="inp">
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="分享連結" />
          </span>
          <span className="small">{copied ? '已複製到剪貼簿。' : '選取上面的網址複製。'}隊友打開後，他的 1F 會換成這台電梯的資料（可以復原）。</span>
        </>
      )}
    </div>
  )
}
