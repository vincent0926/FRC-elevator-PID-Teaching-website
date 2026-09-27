import { useMemo } from 'react'
import { Chart, type ChartSeries } from '../../components/Chart'
import type { AlignedLog, RoleKey } from '../../core/log/fieldMap'

/** 日誌圖表：四張圖時間軸連動，資料檢查的問題時段用黃色標示。 */

export function LogCharts({ log, bands }: { log: AlignedLog; bands?: [number, number][] }) {
  const charts = useMemo(() => {
    const c = log.cols
    const pick = (defs: [RoleKey, string, string, boolean?][]): ChartSeries[] =>
      defs.filter(([k]) => c[k]).map(([k, label, color, dash]) => ({ label, color, dash, values: c[k]! }))
    return {
      pos: pick([
        ['reference', '目標（閉迴路參考）', '--steel', true],
        ['position', '實際位置', '--blue'],
      ]),
      vel: pick([
        ['referenceSlope', '參考速度', '--steel', true],
        ['velocity', '實際速度', '--blue'],
      ]),
      volt: pick([
        ['appliedVolts', '輸出電壓', '--ink-2'],
        ['feedforwardOutput', '前饋', '--green'],
        ['closedLoopOutput', '回授（P+I+D）', '--red'],
      ]),
      power: pick([
        ['statorCurrent', 'Stator 電流（A）', '--amber'],
        ['supplyVoltage', '電池電壓（V）', '--violet'],
      ]),
    }
  }, [log])

  return (
    <div className="panel stack">
      <Chart title="位置" x={log.t} series={charts.pos} height={220} yLabel="m" syncKey="log" bands={bands} />
      {charts.vel.length > 0 && <Chart title="速度" x={log.t} series={charts.vel} height={160} yLabel="m/s" syncKey="log" bands={bands} />}
      {charts.volt.length > 0 && <Chart title="電壓" x={log.t} series={charts.volt} height={180} yLabel="V" syncKey="log" bands={bands} />}
      {charts.power.length > 0 && <Chart title="電流與電池" x={log.t} series={charts.power} height={160} syncKey="log" bands={bands} />}
      <p className="small muted" style={{ margin: 0 }}>
        在圖上拖曳放大時間軸，點兩下還原。
      </p>
    </div>
  )
}
