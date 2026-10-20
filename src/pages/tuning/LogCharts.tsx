import { useMemo } from 'react'
import { Chart, type ChartSeries } from '../../components/Chart'
import type { AlignedLog, RoleKey } from '../../core/log/fieldMap'
import { t } from '../../core/lang'

/** 日誌圖表：四張圖時間軸連動，資料檢查的問題時段用黃色標示。 */

/** angle：手臂，位置與速度換成度顯示（資料本身是 rad） */
export function LogCharts({ log, bands, angle }: { log: AlignedLog; bands?: [number, number][]; angle?: boolean }) {
  const charts = useMemo(() => {
    const c = log.cols
    const R2D = 180 / Math.PI
    const kin: RoleKey[] = ['reference', 'position', 'referenceSlope', 'velocity']
    const pick = (defs: [RoleKey, string, string, boolean?][]): ChartSeries[] =>
      defs
        .filter(([k]) => c[k])
        .map(([k, label, color, dash]) => ({ label, color, dash, values: angle && kin.includes(k) ? Float64Array.from(c[k]!, (v) => v * R2D) : c[k]! }))
    return {
      pos: pick([
        ['reference', t('目標（閉迴路參考）', 'Target (closed-loop reference)'), '--steel', true],
        ['position', t('實際位置', 'Actual position'), '--blue'],
      ]),
      vel: pick([
        ['referenceSlope', t('參考速度', 'Reference velocity'), '--steel', true],
        ['velocity', t('實際速度', 'Actual velocity'), '--blue'],
      ]),
      volt: pick([
        ['appliedVolts', t('輸出電壓', 'Output voltage'), '--ink-2'],
        ['feedforwardOutput', t('前饋', 'Feedforward'), '--green'],
        ['closedLoopOutput', t('回授（P+I+D）', 'Feedback (P+I+D)'), '--red'],
      ]),
      power: pick([
        ['statorCurrent', t('Stator 電流（A）', 'Stator current (A)'), '--amber'],
        ['supplyVoltage', t('電池電壓（V）', 'Battery voltage (V)'), '--violet'],
      ]),
    }
  }, [log, angle])

  return (
    <div className="panel stack">
      <Chart title={t('位置', 'Position')} x={log.t} series={charts.pos} height={220} yLabel={angle ? '°' : 'm'} syncKey="log" bands={bands} />
      {charts.vel.length > 0 && <Chart title={t('速度', 'Velocity')} x={log.t} series={charts.vel} height={160} yLabel={angle ? '°/s' : 'm/s'} syncKey="log" bands={bands} />}
      {charts.volt.length > 0 && <Chart title={t('電壓', 'Voltage')} x={log.t} series={charts.volt} height={180} yLabel="V" syncKey="log" bands={bands} />}
      {charts.power.length > 0 && <Chart title={t('電流與電池', 'Current and battery')} x={log.t} series={charts.power} height={160} syncKey="log" bands={bands} />}
      <p className="small muted" style={{ margin: 0 }}>
        {t('在圖上拖曳放大時間軸，點兩下還原。', 'Drag on a chart to zoom the time axis; double-click to reset.')}
      </p>
    </div>
  )
}
