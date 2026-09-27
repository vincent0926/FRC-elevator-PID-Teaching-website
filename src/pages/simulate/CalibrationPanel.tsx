import { useMemo, useState } from 'react'
import { useStore, type Calibration } from '../../app/store'
import { Chart } from '../../components/Chart'
import { makeChallenge } from '../../core/challenge'
import type { AlignedLog } from '../../core/log/fieldMap'
import { sampleAlignedLog } from '../../core/log/sampleLog'
import { calibrate, CALIBRATION_RMS_LIMIT, type CalibrationResult } from '../../core/physics/calibrate'

/**
 * 模型校正（3F 步驟 9）：拿 2F 匯入的實機日誌，讓模擬的電梯跟真的對得上。
 * 校正好之後「已校正模型」可以用，調參建議的「在模擬中預覽」也比較可信。
 */

const cm = (v: number) => `${(v * 100).toFixed(1)} cm`

export function CalibrationPanel({ onApply }: { onApply: (c: Calibration) => void }) {
  const { mechanism, ff, theory, lastLog, calibration, setCalibration, go } = useStore()
  const [src, setSrc] = useState<{ log: AlignedLog; name: string; truth?: string } | null>(null)
  const result: CalibrationResult | null = useMemo(() => (src ? calibrate(src.log, mechanism, ff) : null), [src, mechanism, ff])

  const practice = () => {
    // 練習：藏一台跟理論不一樣的電梯，產生一份日誌讓你校正，最後對答案
    const h = makeChallenge(Math.floor(Math.random() * 1e9), 'hard')
    const f = (h.frictionUp + h.frictionDown) / 2
    const log = sampleAlignedLog({
      mechanism,
      ff,
      gains: { ...theory.feedforward, ...theory.feedback, kS: f },
      // 加速度放慢，50 Hz 的日誌才抓得到加速段
      motionMagic: { cruiseVelocity: theory.motionMagic.cruiseVelocity * 0.6, acceleration: theory.motionMagic.acceleration * 0.4 },
      plant: { realistic: true, kGScale: h.kGScale, kVScale: h.kVScale, kAScale: h.kAScale, frictionKs: f },
      seed: Math.floor(Math.random() * 1e9),
    })
    setSrc({
      log,
      name: '練習用範例日誌',
      truth: `答案：重量 ×${h.kGScale.toFixed(2)}、kV ×${h.kVScale.toFixed(2)}、慣性 ×${h.kAScale.toFixed(2)}、摩擦 ${f.toFixed(2)} V`,
    })
  }

  const save = () => {
    if (!result || !src) return
    const c: Calibration = {
      at: new Date().toISOString(),
      logName: src.name,
      kGScale: result.kGScale,
      kVScale: result.kVScale,
      kAScale: result.kAScale,
      friction: result.friction,
      rms: result.calibrated.rms,
      rmsTheory: result.theory.rms,
    }
    setCalibration(c)
    onApply(c)
  }

  const rows: [string, number, number, string][] = result
    ? [
        ['kG（重力 − 配重）', ff.kG, result.fit.kG, 'V'],
        ['kV（反電動勢、效率）', ff.kV, result.fit.kV, 'V/(m/s)'],
        ['kA（等效質量）', ff.kA, result.fit.kA, 'V/(m/s²)'],
        ['摩擦', 0, result.friction, 'V'],
      ]
    : []

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h2>模型校正</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        理論模型是用 1F 填的資料算的，真的電梯多少不一樣。把實機日誌的輸出電壓直接餵給模擬（開迴路重播），調整重力、kV、等效質量、摩擦讓位置對得上，
        就得到「已校正模型」。之後在模擬裡預覽調參建議，結果比較接近真的機器人。
      </p>
      <div className="row">
        <button className="btn small" type="button" disabled={!lastLog} onClick={() => lastLog && setSrc({ log: lastLog.log, name: lastLog.name })}>
          {lastLog ? `用 2F 匯入的「${lastLog.name}」校正` : '還沒在 2F 匯入日誌'}
        </button>
        {!lastLog && (
          <button className="linkbtn small" type="button" onClick={() => go('tune')}>
            到 2F 匯入
          </button>
        )}
        <button className="btn small" type="button" onClick={practice}>
          用範例日誌練習
        </button>
        {calibration && (
          <span className="small muted">
            目前已校正：{calibration.logName}，誤差 {cm(calibration.rms)}
            <button className="linkbtn" type="button" style={{ marginLeft: 8 }} onClick={() => setCalibration(null)}>
              清除
            </button>
          </span>
        )}
      </div>

      {src && !result && <div className="warn">這份日誌擬合不出來：需要有上下移動、而且記錄了輸出電壓和速度。</div>}
      {src && result && (
        <>
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>受控體</th>
                  <th className="num">理論</th>
                  <th className="num">從日誌擬合</th>
                  <th className="num">倍率</th>
                  <th>單位</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([k, th, fit, u]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td className="num">{th === 0 ? '沒算' : Number(th.toPrecision(4))}</td>
                    <td className="num">{Number(fit.toPrecision(4))}</td>
                    <td className="num">{th === 0 ? '—' : `×${(fit / th).toFixed(2)}`}</td>
                    <td className="muted">{u}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small" style={{ margin: '8px 0' }}>
            開迴路重播的位置誤差：理論模型 <b>{cm(result.theory.rms)}</b> → 校正後 <b className={result.ok ? 'pass' : 'fail'}>{cm(result.calibrated.rms)}</b>
            （門檻 {cm(CALIBRATION_RMS_LIMIT)}，擬合 R² {result.fit.r2.toFixed(3)}，{result.calibrated.windows} 段移動）
          </p>
          {src.truth && <div className="note">{src.truth}</div>}
          {result.problems.map((p) => (
            <div key={p} className="warn">
              {p}
            </div>
          ))}
          <Chart
            title="開迴路重播：實測 vs 模擬"
            x={result.theory.t}
            series={[
              { label: '實測位置', color: '--ink-2', values: result.theory.measured },
              { label: '理論模型重播', color: '--violet', dash: true, values: result.theory.replayed },
              { label: '校正後重播', color: '--green', values: result.calibrated.replayed },
            ]}
            height={220}
            yLabel="m"
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary small" type="button" disabled={!result.ok} onClick={save}>
              存成已校正模型並套用
            </button>
            <span className="small muted">{result.ok ? '會把受控體設定改成校正後的倍率與摩擦。' : '吻合度不夠，不能標成已校正。'}</span>
          </div>
        </>
      )}
    </div>
  )
}
