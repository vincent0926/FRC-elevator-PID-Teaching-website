import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { Chart, type ChartSeries } from '../../components/Chart'
import { ratioPoint, sweepRatios } from '../../core/ratioSweep'
import { shareUrl } from '../../core/shareLink'
import { t } from '../../core/lang'

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
    () => [{ label: t('跑完全程的時間', 'Full-travel time'), color: '--blue', values: Float64Array.from(points, (p) => (Number.isFinite(p.travelTime) ? p.travelTime : NaN)) }],
    [points],
  )
  const cur: ChartSeries[] = useMemo(
    () => [
      { label: t('停在半空每顆馬達的電流', 'Holding current per motor (mid-air)'), color: '--amber', values: Float64Array.from(points, (p) => p.holdCurrent) },
      { label: t('Stator 電流限制', 'Stator current limit'), color: '--red', dash: true, values: Float64Array.from(points, () => mechanism.statorCurrentLimit) },
    ],
    [points, mechanism.statorCurrentLimit],
  )
  const band = useMemo<[number, number][]>(() => [[G - 0.08, G + 0.08]], [G])
  const slower = fastest && here.travelTime - fastest.travelTime > 0.05

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        {t(
          <>
          其他機構資料不變，只換齒比。時間用 Motion Magic 建議值（速度、加速度上限的 75%）算從最低跑到最高；黃色直線是你現在的齒比 {G}:1。
          </>,
          <>
            Everything else stays the same; only the gear ratio changes. Time uses the Motion Magic suggestion (75% of the velocity and acceleration limits) for bottom to top; the yellow line is your current ratio {G}:1.
          </>,
        )}
      </p>
      <Chart title={t('跑完全程的時間', 'Full-travel time')} x={x} series={time} height={170} yLabel="s" xLabel=":1" xName={t('齒比', 'Gear ratio')} bands={band} />
      <Chart title={t('停在半空的電流（每顆馬達）', 'Holding current mid-air (per motor)')} x={x} series={cur} height={150} yLabel="A" xLabel=":1" xName={t('齒比', 'Gear ratio')} bands={band} />
      <table className="tbl">
        <tbody>
          <tr>
            <td>{t(`現在 ${G}:1`, `Now ${G}:1`)}</td>
            <td className="num">{f(here.travelTime, 2)} s</td>
            <td className="num">{f(here.holdCurrent, 1)} A</td>
            <td className="num">{t(`最高 ${f(here.cruiseVelocity, 2)} m/s`, `Max ${f(here.cruiseVelocity, 2)} m/s`)}</td>
          </tr>
          {fastest && (
            <tr>
              <td>{t(`最快 ${f(fastest.ratio, 1)}:1`, `Fastest ${f(fastest.ratio, 1)}:1`)}</td>
              <td className="num">{f(fastest.travelTime, 2)} s</td>
              <td className="num">{f(fastest.holdCurrent, 1)} A</td>
              <td className="num">{t(`最高 ${f(fastest.cruiseVelocity, 2)} m/s`, `Max ${f(fastest.cruiseVelocity, 2)} m/s`)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="small">
        {t(
          <>
          <b>怎麼看：</b>齒比小，最高速度高，但扛重力要吃比較多電流、起步加速度被電流限制卡住；齒比大，省電流、kG 小，但最高速度低，行程長時反而慢。
          最快的齒比不一定最好：留一點餘裕給比賽後段電池變低、機構變重，通常選比最快<b>稍大一點</b>的齒比。停在半空的電流太大（例如超過 20 A）馬達會一直發熱。
          </>,
          <>
            <b>How to read it:</b> a small ratio gives a higher top speed, but holding against gravity draws more current and the start is limited by the current limit; a big ratio saves current and has a smaller kG, but the top speed is lower and long travels end up slower.{' '}
            The fastest ratio isn’t always best: leave margin for a low battery late in the match and a heavier mechanism, usually a ratio <b>a bit bigger</b> than the fastest. Too much holding current mid-air (say over 20 A) keeps the motor heating up.
          </>,
        )}
      </div>
      {slower && fastest && (
        <div className="row">
          <button className="btn small" type="button" onClick={() => setMechanism({ ...mechanism, gearRatio: Math.round(fastest.ratio * 10) / 10 })}>
            {t(`試試 ${f(fastest.ratio, 1)}:1（參數卡會跟著變）`, `Try ${f(fastest.ratio, 1)}:1 (the parameter card follows)`)}
          </button>
          <span className="small muted">{t('齒比是機構決定的，換之前確認有這種齒輪箱組合。', 'The gear ratio is set by the hardware; check that gearbox combination exists before switching.')}</span>
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
          {t('產生分享連結', 'Make a share link')}
        </button>
        <span className="small muted">{t('只放機構資料（質量、齒比、馬達……），不放調過的參數。', 'Only the mechanism data (masses, gear ratio, motors…), not your tuned gains.')}</span>
      </div>
      {url && (
        <>
          <span className="inp">
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={t('分享連結', 'Share link')} />
          </span>
          <span className="small">
            {copied ? t('已複製到剪貼簿。', 'Copied to the clipboard. ') : t('選取上面的網址複製。', 'Select the link above to copy it. ')}
            {t('隊友打開後，他的 1F 會換成這台電梯的資料（可以復原）。', 'When a teammate opens it, their 1F switches to this elevator’s data (they can restore theirs).')}
          </span>
        </>
      )}
    </div>
  )
}
