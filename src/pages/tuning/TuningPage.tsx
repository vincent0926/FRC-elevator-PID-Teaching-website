import { useMemo, useState } from 'react'
import { downloadBlob } from '../../app/download'
import { useStore } from '../../app/store'
import { runDataChecks, type CheckReport } from '../../core/analysis/checks'
import { alignSeries, missingRequired, suggestMapping, type AlignedLog, type FieldMapping } from '../../core/log/fieldMap'
import type { ScanResult } from '../../core/log/reader'
import { makeSampleLog } from '../../core/log/sampleLog'
import { extractLog, scanLog } from '../../workers/client'
import { FieldMappingTable } from './FieldMappingTable'
import { LogCharts } from './LogCharts'
import { SCENARIOS } from './sampleScenarios'

/**
 * 2F 調參建議。Phase 1 先做到「步驟 0：匯入並檢查」：
 * 串流解析 → 欄位對應 → 對齊 → 資料檢查 → 看圖。找問題與建議在 Phase 2。
 */

type Stage = 'idle' | 'scanning' | 'mapping' | 'reading' | 'done'

const STATUS_MARK = { pass: '✓', warn: '!', fail: '✕', skip: '–' } as const

export function TuningPage() {
  const { mechanism, ff, theory, fieldMapping, setFieldMapping } = useStore()
  const [stage, setStage] = useState<Stage>('idle')
  const [file, setFile] = useState<{ blob: Blob; name: string; scenario?: string } | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [mapping, setMapping] = useState<FieldMapping | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<AlignedLog | null>(null)
  const [report, setReport] = useState<CheckReport | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id)

  const open = async (blob: Blob, name: string, scenario?: string) => {
    setFile({ blob, name, scenario })
    setError(null)
    setLog(null)
    setReport(null)
    setHighlight(null)
    setStage('scanning')
    setProgress(0)
    try {
      const s = await scanLog(blob, setProgress)
      if (!s.entries.length) throw new Error('這個檔案裡沒有任何欄位。')
      setScan(s)
      const m = suggestMapping(s.entries, fieldMapping)
      setMapping(m)
      setStage('mapping')
      // 欄位都自動對到了就直接讀，不用多按一次
      if (!missingRequired(m).length && Object.keys(fieldMapping).length) await read(blob, m)
    } catch (e) {
      setError(`讀不了 ${name}：${e instanceof Error ? e.message : String(e)}（確認是 .wpilog，而不是 .hoot 或 .rlog）`)
      setStage('idle')
    }
  }

  const read = async (blob: Blob, m: FieldMapping) => {
    setStage('reading')
    setProgress(0)
    setError(null)
    try {
      const names = Object.values(m)
        .map((r) => r.entry)
        .filter((n): n is string => !!n)
      const series = await extractLog(blob, names, setProgress)
      const aligned = alignSeries(series, m)
      setLog(aligned)
      setReport(runDataChecks(aligned, { statorCurrentLimit: mechanism.statorCurrentLimit }))
      setFieldMapping(m)
      setStage('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('mapping')
    }
  }

  const makeSample = () => {
    const sc = SCENARIOS.find((s) => s.id === scenarioId)!
    const { gains, motionMagic } = sc.build(theory, ff)
    const bytes = makeSampleLog({ mechanism, ff, gains, motionMagic })
    return { blob: new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), name: `sample-${sc.id}.wpilog`, sc }
  }

  const bands = useMemo(() => report?.items.find((i) => i.key === highlight)?.spans ?? undefined, [report, highlight])
  const scenario = file?.scenario ? SCENARIOS.find((s) => s.id === file.scenario) : undefined
  const busy = stage === 'scanning' || stage === 'reading'

  return (
    <section aria-labelledby="t-tune">
      <div className="head">
        <div>
          <h1 id="t-tune">調參建議</h1>
          <p className="lead">匯入實機日誌，先檢查資料能不能用，再看問題出在哪。一次只處理一個問題，改完再測。</p>
        </div>
        <span className="phase">Phase 1：匯入、欄位對應、資料檢查</span>
      </div>

      <ol className="steps" aria-label="目前步驟">
        <li className="cur" aria-current="step">
          0 匯入並檢查
        </li>
        <li>1 找出問題</li>
        <li>2 處理問題</li>
        <li>3 驗證</li>
      </ol>

      <div className="grid2">
        <div className="stack">
          <div
            className={'drop' + (over ? ' over' : '')}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              const f = e.dataTransfer.files[0]
              if (f && !busy) void open(f, f.name)
            }}
          >
            <b>把 .wpilog 拖到這裡</b>
            <br />
            <span className="muted">或</span>{' '}
            <label className="btn" style={{ marginTop: 6 }}>
              選擇檔案
              <input
                type="file"
                accept=".wpilog"
                hidden
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void open(f, f.name)
                }}
              />
            </label>
            <br />
            <span className="muted small">檔案只在這台電腦的瀏覽器裡解析，不會上傳。第一次匯入要設定欄位對應，之後自動套用。</span>
            {busy && (
              <>
                <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${progress * 100}%` }} />
                </div>
                <span className="small muted">{stage === 'scanning' ? '掃描欄位中…' : '讀取資料中…'}</span>
              </>
            )}
          </div>

          {error && <div className="warn">{error}</div>}

          {mapping && scan && file && stage !== 'idle' && (
            <div className="panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>欄位對應</h2>
                <span className="small muted">
                  {file.name}・{(scan.bytes / 1024 / 1024).toFixed(1)} MB・{scan.entries.length} 個欄位
                  {scan.trailingBytes > 0 && '・檔案結尾不完整（可能斷電）'}
                </span>
              </div>
              <FieldMappingTable entries={scan.entries} mapping={mapping} onChange={setMapping} mechanism={mechanism} />
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn primary" type="button" disabled={busy || missingRequired(mapping).length > 0} onClick={() => void read(file.blob, mapping)}>
                  {stage === 'done' ? '重新讀取並檢查' : '讀取並檢查'}
                </button>
                {missingRequired(mapping).length > 0 && (
                  <span className="small fail">還缺：{missingRequired(mapping).map((r) => r.label).join('、')}</span>
                )}
              </div>
            </div>
          )}

          {log && <LogCharts log={log} bands={bands} />}
        </div>

        <div className="stack">
          {report && (
            <div className="panel">
              <h2>步驟 0：資料檢查</h2>
              <p className="small muted">Enable 時間 {report.enabledSeconds.toFixed(1)} 秒。任何一項 ✕ 都不能拿來分析，先解決再重錄。</p>
              <ul className="checks">
                {report.items.map((it) => (
                  <li key={it.key}>
                    <span className={'st ' + it.status} aria-label={it.status}>
                      {STATUS_MARK[it.status]}
                    </span>
                    <div>
                      <b>{it.label}</b>
                      <div className="small">{it.detail}</div>
                      {it.spans && it.spans.length > 0 && (
                        <button type="button" className="linkbtn" onClick={() => setHighlight(highlight === it.key ? null : it.key)}>
                          {highlight === it.key ? '取消標示' : `在圖上標示（${it.spans.length} 段）`}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className={report.ok ? 'ok' : 'warn'}>
                {report.ok ? '資料可以用。' : '資料檢查沒過，這份日誌不能拿來算建議，照上面說明處理後重錄。'}
              </div>
            </div>
          )}

          {report?.ok && (
            <div className="panel">
              <h2>先自己看看</h2>
              <p className="small">自動找問題、給建議（步驟 1–3）在 Phase 2 開放。現在先練習自己讀圖，照這個順序：</p>
              <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
                <li>
                  <b>物理限制</b>：輸出電壓有沒有貼到電池電壓？電流有沒有頂到限制？
                </li>
                <li>
                  <b>振盪</b>：位置或電壓有沒有來回抖？
                </li>
                <li>
                  <b>kG</b>：停著的時候，回授輸出是不是一直偏同一邊？偏正代表 kG 太小。
                </li>
                <li>
                  <b>kS</b>：往上時回授偏正、往下時偏負、大小差不多？那是摩擦。
                </li>
                <li>
                  <b>kV</b>：等速段一直落後或超前？
                </li>
                <li>
                  <b>kA</b>：只有加速、減速段對不上？
                </li>
                <li>
                  <b>kP / kD</b>：前饋都準了，到位還是慢或會晃，才動 PID。
                </li>
              </ol>
              {scenario && (
                <details style={{ marginTop: 10 }}>
                  <summary className="small" style={{ cursor: 'pointer' }}>
                    看答案：這份範例日誌是「{scenario.label}」
                  </summary>
                  <p className="small" style={{ marginTop: 6 }}>
                    {scenario.lookFor}
                  </p>
                </details>
              )}
            </div>
          )}

          <div className="panel">
            <h2>沒有日誌？</h2>
            <p className="small">用模擬器產生一份跟範例機器人程式欄位相同的日誌（50 Hz），拿來練習匯入和讀圖。</p>
            <div className="row">
              <label className="f" style={{ flex: '1 1 160px' }}>
                情境
                <span className="inp">
                  <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
                    {SCENARIOS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => {
                  const s = makeSample()
                  void open(s.blob, s.name, s.sc.id)
                }}
              >
                產生並匯入
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const s = makeSample()
                  downloadBlob(s.name, s.blob)
                }}
              >
                下載 .wpilog
              </button>
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              下載的檔案也可以用 AdvantageScope 打開，對照看。
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
