import { useEffect, useMemo, useState } from 'react'
import { downloadBlob } from '../../app/download'
import { StepBar } from '../../components/StepBar'
import type { SimLogHandoff } from '../../app/simLog'
import type { ArmParameterSet } from '../../schema/armParameterSet'
import { runDataChecks, type CheckReport } from '../../core/analysis/checks'
import { estimateRobotGains, oscillationBehindRefusal } from '../../core/analysis/diagnose'
import { makeArmSampleLog } from '../../core/arm/sampleLog'
import { alignSeries, missingRequired, suggestMapping, type AlignedLog, type FieldMapping } from '../../core/log/fieldMap'
import type { ScanResult } from '../../core/log/reader'
import { extractLog, scanLog } from '../../workers/client'
import { FieldMappingTable } from '../tuning/FieldMappingTable'
import { LogCharts } from '../tuning/LogCharts'
import { ArmDiagnosisPanel } from './ArmDiagnosisPanel'
import { ARM_LOG_SCENARIOS } from './armLogScenarios'
import { useArm } from './armStore'
import { armGains } from './armTuning'
import { UnsavedNote } from './UnsavedNote'
import { HelpLink } from '../../components/HelpLink'
import { GUIDE_ANCHOR } from '../guide/guideContent'

/**
 * 手臂 2F 調參建議：跟電梯同一套流程（資料檢查 → 找問題 → 處理一個 → 上機驗證），
 * 差在重力項是 kG·cos θ、位置是角度。欄位對應跟電梯分開記。
 */

type Stage = 'idle' | 'scanning' | 'mapping' | 'reading' | 'done'
const STATUS_MARK = { pass: '✓', warn: '!', fail: '✕', skip: '–' } as const

export function ArmTuningPage() {
  const { arm, ff, theory, custom, fieldMapping, setFieldMapping, simLog, setSimLog } = useArm()
  const [stage, setStage] = useState<Stage>('idle')
  // sim：3F 送來的模擬結果（不是檔案，沒有 blob、不用對欄位）
  const [file, setFile] = useState<{ blob: Blob | null; name: string; scenario?: string; sim?: SimLogHandoff<ArmParameterSet> } | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [mapping, setMapping] = useState<FieldMapping | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<AlignedLog | null>(null)
  const [report, setReport] = useState<CheckReport | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [diagBands, setDiagBands] = useState<[number, number][] | null>(null)
  const [logSeq, setLogSeq] = useState(0)
  const [over, setOver] = useState(false)
  const [scenarioId, setScenarioId] = useState(ARM_LOG_SCENARIOS[0].id)

  /** 對齊好的欄位 → 資料檢查 → 畫面（實機日誌和 3F 送來的模擬共用） */
  const accept = (aligned: AlignedLog) => {
    setLog(aligned)
    setLogSeq((k) => k + 1)
    setDiagBands(null)
    setReport(runDataChecks(aligned, { statorCurrentLimit: arm.statorCurrentLimit, angle: true }))
    setStage('done')
  }

  // 3F「送到 2F」：直接用模擬的欄位，不用編成 .wpilog 再解開
  useEffect(() => {
    if (!simLog) return
    setFile({ blob: null, name: simLog.name, sim: simLog })
    setScan(null)
    setMapping(null)
    setError(null)
    setHighlight(null)
    accept(simLog.log)
    setSimLog(null)
    // accept 每次 render 都是新的函式，只在收到新的模擬時跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simLog])

  const read = async (blob: Blob, m: FieldMapping) => {
    setStage('reading')
    setProgress(0)
    setError(null)
    try {
      const names = Object.values(m)
        .map((r) => r.entry)
        .filter((n): n is string => !!n)
      const aligned = alignSeries(await extractLog(blob, names, setProgress), m)
      accept(aligned)
      setFieldMapping(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('mapping')
    }
  }

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
      const m = suggestMapping(s.entries, fieldMapping, 'arm')
      setMapping(m)
      setStage('mapping')
      if (!missingRequired(m).length && Object.keys(fieldMapping).length) await read(blob, m)
    } catch (e) {
      setError(`讀不了 ${name}：${e instanceof Error ? e.message : String(e)}（確認是 .wpilog，而不是 .hoot 或 .rlog）`)
      setStage('idle')
    }
  }

  const makeSample = () => {
    const sc = ARM_LOG_SCENARIOS.find((s) => s.id === scenarioId)!
    const bytes = makeArmSampleLog({ arm, ff, ...sc.build(theory, ff) })
    return { blob: new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), name: `arm-sample-${sc.id}.wpilog`, sc }
  }

  const bands = useMemo(() => diagBands ?? report?.items.find((i) => i.key === highlight)?.spans ?? undefined, [report, highlight, diagBands])
  const refusalOsc = useMemo(() => {
    if (!log || !report || report.ok) return null
    const g = armGains(custom ?? theory)
    return oscillationBehindRefusal(log, estimateRobotGains(log, g, undefined, 'arm')?.gains ?? g, 'arm')
  }, [log, report, custom, theory])
  const scenario = file?.scenario ? ARM_LOG_SCENARIOS.find((s) => s.id === file.scenario) : undefined
  const busy = stage === 'scanning' || stage === 'reading'

  return (
    <section aria-labelledby="t-arm-tune">
      <div className="head">
        <div>
          <h1 id="t-arm-tune">手臂・調參建議</h1>
          <p className="lead">匯入手臂的實機日誌，先檢查資料能不能用，再看問題出在哪。一次只處理一個問題，改完再測。 <HelpLink section={GUIDE_ANCHOR.tune} /></p>
        </div>
        <span className="phase">一次只改一個參數</span>
      </div>
      <UnsavedNote />

      <StepBar report={!report ? 'none' : report.ok ? 'ok' : 'failed'} prefix="arm-tune" />

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
            <b>把手臂的 .wpilog 拖到這裡</b>
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
            <span className="muted small">檔案只在這台電腦的瀏覽器裡解析，不會上傳。第一次匯入要設定欄位對應，之後自動套用。角度要是弧度、0 = 水平（範例程式的 ArmIO 就是）。</span>
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

          {file?.sim && (
            <div className="note">
              這份是 <b>3F 模擬</b>出來的資料，不是實機日誌。拿來練習讀圖、看調參建議，數字以上機實測為準。診斷會直接用模擬時的參數當「機器人上當時的參數」。
              按「套用」後回 3F 選「自訂」，同樣的目標再跑一次，看問題有沒有消失。
            </div>
          )}

          {mapping && scan && file && stage !== 'idle' && (
            <div className="panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>欄位對應</h2>
                <span className="small muted">
                  {file.name}・{(scan.bytes / 1024 / 1024).toFixed(1)} MB・{scan.entries.length} 個欄位
                  {scan.trailingBytes > 0 && '・檔案結尾不完整（可能斷電）'}
                </span>
              </div>
              {/* 讀取完成後把對應表收起來：11 列的表一直攤開，下面的圖要捲很久才看得到。檢查沒過時保持展開（多半要改欄位或倍率）；open 跟著狀態變，使用者自己展開不會被蓋掉 */}
              <details className="map-done" open={stage !== 'done' || report?.ok === false}>
                <summary className="small">{stage !== 'done' ? '對應表（自動猜的，讀取前確認一下）' : report?.ok === false ? '資料檢查沒過：先確認欄位和倍率有沒有選錯' : '資料已讀取。要改欄位或倍率再展開'}</summary>
                <FieldMappingTable entries={scan.entries} mapping={mapping} onChange={setMapping} />
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn primary" type="button" disabled={busy || !file.blob || missingRequired(mapping).length > 0} onClick={() => file.blob && void read(file.blob, mapping)}>
                    {stage === 'done' ? '重新讀取並檢查' : '讀取並檢查'}
                  </button>
                  {missingRequired(mapping).length > 0 && (
                    <span className="small fail">還缺：{missingRequired(mapping).map((r) => r.label).join('、')}</span>
                  )}
                </div>
              </details>
            </div>
          )}

          {log && <LogCharts log={log} bands={bands} angle />}
        </div>

        <div className="stack">
          {report && (
            <div className="panel" id="arm-tune-step-0">
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
                        <button
                          type="button"
                          className="linkbtn"
                          onClick={() => {
                            setDiagBands(null)
                            setHighlight(highlight === it.key ? null : it.key)
                          }}
                        >
                          {highlight === it.key ? '取消標示' : `在圖上標示（${it.spans.length} 段）`}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className={report.ok ? 'ok' : 'warn'}>{report.ok ? '資料可以用。' : '資料檢查沒過，這份日誌不能拿來算建議，照上面說明處理後重錄。'}</div>
              {refusalOsc && (
                <div className="note">
                  <b>但是：</b>
                  {refusalOsc.summary}（{refusalOsc.evidence[0]}）
                  {refusalOsc.change?.kind === 'gain'
                    ? `建議先把 ${refusalOsc.change.param} 從 ${refusalOsc.change.from} 降到 ${refusalOsc.change.to} 左右。`
                    : refusalOsc.evidence[refusalOsc.evidence.length - 1]}
                </div>
              )}
            </div>
          )}

          {log && report?.ok && file && <ArmDiagnosisPanel key={logSeq} log={log} report={report} logName={file.name} onHighlight={setDiagBands} sim={file.sim} />}

          {report && scenario && (
            <details className="panel">
              <summary className="small" style={{ cursor: 'pointer' }}>
                練習用：這份範例日誌是「{scenario.label}」（先自己判斷再打開）
              </summary>
              <p className="small" style={{ marginBottom: 0 }}>
                {scenario.lookFor}
              </p>
            </details>
          )}

          <div className="panel">
            <h2>沒有日誌？</h2>
            <p className="small">用模擬器產生一份跟範例程式（ArmIO）欄位相同的手臂日誌（50 Hz），拿來練習匯入和讀圖。資料是模擬的，不是實機。</p>
            <div className="row">
              <label className="f" style={{ flex: '1 1 160px' }}>
                情境
                <span className="inp">
                  <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
                    {ARM_LOG_SCENARIOS.map((s) => (
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
