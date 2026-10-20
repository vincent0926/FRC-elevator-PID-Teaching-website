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
import { t } from '../../core/lang'

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
      if (!s.entries.length) throw new Error(t('這個檔案裡沒有任何欄位。', 'This file has no fields at all.'))
      setScan(s)
      const m = suggestMapping(s.entries, fieldMapping, 'arm')
      setMapping(m)
      setStage('mapping')
      if (!missingRequired(m).length && Object.keys(fieldMapping).length) await read(blob, m)
    } catch (e) {
      setError(t(`讀不了 ${name}：${e instanceof Error ? e.message : String(e)}（確認是 .wpilog，而不是 .hoot 或 .rlog）`, `Can’t read ${name}: ${e instanceof Error ? e.message : String(e)} (make sure it’s a .wpilog, not a .hoot or .rlog)`))
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
          <h1 id="t-arm-tune">{t('手臂・調參建議', 'Arm · Tuning advice')}</h1>
          <p className="lead">
            {t('匯入手臂的實機日誌，先檢查資料能不能用，再看問題出在哪。一次只處理一個問題，改完再測。', 'Import a log from the arm, check the data is usable, then see where the problem is. Fix one problem at a time and test again after each change.')}{' '}
            <HelpLink section={GUIDE_ANCHOR.tune} />
          </p>
        </div>
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
            <b>{t('把手臂的 .wpilog 拖到這裡', 'Drop the arm’s .wpilog here')}</b>
            <br />
            <span className="muted">{t('或', 'or')}</span>{' '}
            <label className="btn" style={{ marginTop: 6 }}>
              {t('選擇檔案', 'Choose a file')}
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
            <span className="muted small">{t('檔案只在這台電腦的瀏覽器裡解析，不會上傳。第一次匯入要設定欄位對應，之後自動套用。角度要是弧度、0 = 水平（範例程式的 ArmIO 就是）。', 'The file is parsed only in this browser and never uploaded. The first import needs a field mapping; after that it’s applied automatically. Angles must be in radians with 0 = horizontal (the example code’s ArmIO does this).')}</span>
            {busy && (
              <>
                <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${progress * 100}%` }} />
                </div>
                <span className="small muted">{stage === 'scanning' ? t('掃描欄位中…', 'Scanning fields…') : t('讀取資料中…', 'Reading data…')}</span>
              </>
            )}
          </div>

          {error && <div className="warn">{error}</div>}

          {file?.sim && (
            <div className="note">
              {t(
                <>
                這份是 <b>3F 模擬</b>出來的資料，不是實機日誌。拿來練習讀圖、看調參建議，數字以上機實測為準。診斷會直接用模擬時的參數當「機器人上當時的參數」。
                按「套用」後回 3F 選「自訂」，同樣的目標再跑一次，看問題有沒有消失。
                </>,
                <>
                  This came from the <b>3F sim</b>, not a robot log. Use it to practice reading charts and the tuning advice; real numbers come from testing on the robot. The diagnosis uses the sim’s gains as “the gains on the robot at the time”.{' '}
                  After pressing “Apply”, go back to 3F, pick “Custom” and run the same target again to see whether the problem is gone.
                </>,
              )}
            </div>
          )}

          {mapping && scan && file && stage !== 'idle' && (
            <div className="panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>{t('欄位對應', 'Field mapping')}</h2>
                <span className="small muted">
                  {file.name}・{(scan.bytes / 1024 / 1024).toFixed(1)} MB・{t(`${scan.entries.length} 個欄位`, `${scan.entries.length} fields`)}
                  {scan.trailingBytes > 0 && t('・檔案結尾不完整（可能斷電）', '・the end of the file is incomplete (maybe a power loss)')}
                </span>
              </div>
              {/* 讀取完成後把對應表收起來：11 列的表一直攤開，下面的圖要捲很久才看得到。檢查沒過時保持展開（多半要改欄位或倍率）；open 跟著狀態變，使用者自己展開不會被蓋掉 */}
              <details className="map-done" open={stage !== 'done' || report?.ok === false}>
                <summary className="small">{stage !== 'done' ? t('對應表（自動猜的，讀取前確認一下）', 'Mapping table (auto-guessed; check it before reading)') : report?.ok === false ? t('資料檢查沒過：先確認欄位和倍率有沒有選錯', 'Data checks failed: first check the fields and scale factors') : t('資料已讀取。要改欄位或倍率再展開', 'Data loaded. Expand to change fields or scale factors')}</summary>
                <FieldMappingTable entries={scan.entries} mapping={mapping} onChange={setMapping} />
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn primary" type="button" disabled={busy || !file.blob || missingRequired(mapping).length > 0} onClick={() => file.blob && void read(file.blob, mapping)}>
                    {stage === 'done' ? t('重新讀取並檢查', 'Re-read and check') : t('讀取並檢查', 'Read and check')}
                  </button>
                  {missingRequired(mapping).length > 0 && (
                    <span className="small fail">{t('還缺：', 'Still missing: ')}{missingRequired(mapping).map((r) => r.label).join(t('、', ', '))}</span>
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
              <h2>{t('步驟 0：資料檢查', 'Step 0: data checks')}</h2>
              <p className="small muted">{t(`Enable 時間 ${report.enabledSeconds.toFixed(1)} 秒。任何一項 ✕ 都不能拿來分析，先解決再重錄。`, `Enabled for ${report.enabledSeconds.toFixed(1)} s. Any ✕ means the log can’t be analyzed; fix it and record again.`)}</p>
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
                          {highlight === it.key ? t('取消標示', 'Clear highlight') : t(`在圖上標示（${it.spans.length} 段）`, `Highlight on chart (${it.spans.length} spans)`)}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className={report.ok ? 'ok' : 'warn'}>{report.ok ? t('資料可以用。', 'The data is usable.') : t('資料檢查沒過，這份日誌不能拿來算建議，照上面說明處理後重錄。', 'Data checks failed, so this log can’t be used for advice. Fix what’s described above and record again.')}</div>
              {refusalOsc && (
                <div className="note">
                  <b>{t('但是：', 'However:')}</b>
                  {refusalOsc.summary}{t('（', ' (')}{refusalOsc.evidence[0]}{t('）', ') ')}
                  {refusalOsc.change?.kind === 'gain'
                    ? t(`建議先把 ${refusalOsc.change.param} 從 ${refusalOsc.change.from} 降到 ${refusalOsc.change.to} 左右。`, `First lower ${refusalOsc.change.param} from ${refusalOsc.change.from} to about ${refusalOsc.change.to}.`)
                    : refusalOsc.evidence[refusalOsc.evidence.length - 1]}
                </div>
              )}
            </div>
          )}

          {log && report?.ok && file && <ArmDiagnosisPanel key={logSeq} log={log} report={report} logName={file.name} onHighlight={setDiagBands} sim={file.sim} />}

          {report && scenario && (
            <details className="panel">
              <summary className="small" style={{ cursor: 'pointer' }}>
                {t(`練習用：這份範例日誌是「${scenario.label}」（先自己判斷再打開）`, `Practice: this sample log is “${scenario.label}” (decide for yourself before opening)`)}
              </summary>
              <p className="small" style={{ marginBottom: 0 }}>
                {scenario.lookFor}
              </p>
            </details>
          )}

          <div className="panel">
            <h2>{t('沒有日誌？', 'No log?')}</h2>
            <p className="small">{t('用模擬器產生一份跟範例程式（ArmIO）欄位相同的手臂日誌（50 Hz），拿來練習匯入和讀圖。資料是模擬的，不是實機。', 'Generate an arm log from the simulator with the same fields as the example code (ArmIO) at 50 Hz to practice importing and reading charts. The data is simulated, not from a robot.')}</p>
            <div className="row">
              <label className="f" style={{ flex: '1 1 160px' }}>
                {t('情境', 'Scenario')}
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
                {t('產生並匯入', 'Generate and import')}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const s = makeSample()
                  downloadBlob(s.name, s.blob)
                }}
              >
                {t('下載 .wpilog', 'Download .wpilog')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
